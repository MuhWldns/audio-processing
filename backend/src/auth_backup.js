import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as DiscordStrategy } from "passport-discord";
import { prisma } from "./prisma.js";

const googleScopes = ["email", "profile"];
const discordScopes = ["identify", "email"];
const DEFAULT_DAILY_FREE_AUDIO_LIMIT = 3;
const DEFAULT_PAID_AUDIO_TOKEN_COST = 1;

const toIsoStringOrNull = (value) => (value ? new Date(value).toISOString() : null);
const getDateKey = (date = new Date()) => date.toISOString().slice(0, 10);

const ensureWallet = async (userId) => {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (wallet) {
    return wallet;
  }

  return await prisma.wallet.create({
    data: {
      userId,
    },
  });
};

const mapGoogleProfile = (profile) => {
  const email = profile.emails?.[0]?.value ?? null;
  const avatarUrl = profile.photos?.[0]?.value ?? null;

  return {
    provider: "GOOGLE",
    providerAccountId: profile.id,
    email,
    displayName: profile.displayName ?? profile.name?.givenName ?? email ?? "Google user",
    avatarUrl,
  };
};

const mapDiscordProfile = (profile) => {
  const email = profile.email ?? null;
  const avatarUrl = profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : null;

  return {
    provider: "DISCORD",
    providerAccountId: profile.id,
    email,
    displayName: profile.global_name ?? profile.username ?? email ?? "Discord user",
    avatarUrl,
  };
};

const upsertOAuthUser = async ({ provider, providerAccountId, email, displayName, avatarUrl, accessToken, refreshToken, expiresAt, scope, tokenType, idToken }) => {
  const account = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId,
      },
    },
    include: {
      user: true,
    },
  });

  if (account) {
    const user = await prisma.user.update({
      where: { id: account.userId },
      data: {
        email: account.user.email ?? email ?? undefined,
        displayName: displayName ?? account.user.displayName ?? undefined,
        avatarUrl: avatarUrl ?? account.user.avatarUrl ?? undefined,
        lastLoginAt: new Date(),
        lastLoginProvider: provider,
      },
    });

    await prisma.oAuthAccount.update({
      where: { id: account.id },
      data: {
        accessToken,
        refreshToken,
        expiresAt,
        scope,
        tokenType,
        idToken,
      },
    });

    await ensureWallet(user.id);

    return user;
  }

  const user = await prisma.user.create({
    data: {
      email,
      displayName,
      avatarUrl,
      lastLoginAt: new Date(),
      lastLoginProvider: provider,
      accounts: {
        create: {
          provider,
          providerAccountId,
          accessToken,
          refreshToken,
          expiresAt,
          scope,
          tokenType,
          idToken,
        },
      },
      wallet: {
        create: {},
      },
    },
  });

  return user;
};

export function configurePassport() {
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (userId, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          wallet: true,
        },
      });

      done(null, user ?? false);
    } catch (error) {
      done(error);
    }
  });

  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const googleCallbackURL = process.env.GOOGLE_CALLBACK_URL;

  if (googleClientId && googleClientSecret && googleCallbackURL) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: googleClientId,
          clientSecret: googleClientSecret,
          callbackURL: googleCallbackURL,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const profileData = mapGoogleProfile(profile);
            const user = await upsertOAuthUser({
              ...profileData,
              accessToken,
              refreshToken,
              expiresAt: null,
              scope: googleScopes.join(" "),
              tokenType: "Bearer",
              idToken: null,
            });

            done(null, user);
          } catch (error) {
            done(error);
          }
        },
      ),
    );
  }

  const discordClientId = process.env.DISCORD_CLIENT_ID;
  const discordClientSecret = process.env.DISCORD_CLIENT_SECRET;
  const discordCallbackURL = process.env.DISCORD_CALLBACK_URL;

  if (discordClientId && discordClientSecret && discordCallbackURL) {
    passport.use(
      new DiscordStrategy(
        {
          clientID: discordClientId,
          clientSecret: discordClientSecret,
          callbackURL: discordCallbackURL,
          scope: discordScopes,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const profileData = mapDiscordProfile(profile);
            const user = await upsertOAuthUser({
              ...profileData,
              accessToken,
              refreshToken,
              expiresAt: null,
              scope: discordScopes.join(" "),
              tokenType: "Bearer",
              idToken: null,
            });

            done(null, user);
          } catch (error) {
            done(error);
          }
        },
      ),
    );
  }

  return passport;
}

export function isOAuthReady(provider) {
  if (provider === "google") {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL);
  }

  if (provider === "discord") {
    return Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_CALLBACK_URL);
  }

  return false;
}

export async function createAuthActivity(userId, type, title, description) {
  return await prisma.activityLog.create({
    data: {
      userId,
      type,
      status: "SUCCESS",
      title,
      description,
    },
  });
}

export async function handleOAuthLogin({ userId, provider, providerLabel }) {
  await attachLoginMetadata(userId, provider);
  await createAuthActivity(userId, "LOGIN", "Signed in", `Signed in with ${providerLabel}`);
  await ensureWallet(userId);
}

export async function ensureDailyAudioQuota(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      freeAudioDateKey: true,
      freeAudioUsedToday: true,
      freeAudioDailyLimit: true,
      paidAudioTokenCost: true,
    },
  });

  if (!user) {
    return null;
  }

  const todayKey = getDateKey();
  if (user.freeAudioDateKey === todayKey) {
    return user;
  }

  return await prisma.user.update({
    where: { id: userId },
    data: {
      freeAudioDateKey: todayKey,
      freeAudioUsedToday: 0,
      freeAudioDailyLimit: user.freeAudioDailyLimit ?? DEFAULT_DAILY_FREE_AUDIO_LIMIT,
      paidAudioTokenCost: user.paidAudioTokenCost ?? DEFAULT_PAID_AUDIO_TOKEN_COST,
    },
    select: {
      id: true,
      freeAudioDateKey: true,
      freeAudioUsedToday: true,
      freeAudioDailyLimit: true,
      paidAudioTokenCost: true,
    },
  });
}

export function getAudioUsagePrice(user, requestedAudioCount = 1) {
  const dailyLimit = user.freeAudioDailyLimit ?? DEFAULT_DAILY_FREE_AUDIO_LIMIT;
  const paidCost = user.paidAudioTokenCost ?? DEFAULT_PAID_AUDIO_TOKEN_COST;
  const freeUsed = user.freeAudioUsedToday ?? 0;
  const freeRemaining = Math.max(0, dailyLimit - freeUsed);
  const freeCovered = Math.min(requestedAudioCount, freeRemaining);
  const paidUnits = Math.max(0, requestedAudioCount - freeCovered);

  return {
    freeCovered,
    paidUnits,
    tokenCost: paidUnits * paidCost,
    freeRemaining,
    dailyLimit,
  };
}

export async function recordAudioUsage(userId, usedCount = 1) {
  const user = await ensureDailyAudioQuota(userId);
  if (!user) {
    return null;
  }

  const nextCount = user.freeAudioUsedToday + usedCount;

  return await prisma.user.update({
    where: { id: userId },
    data: {
      freeAudioUsedToday: nextCount,
      freeAudioDateKey: user.freeAudioDateKey ?? getDateKey(),
    },
    select: {
      id: true,
      freeAudioDateKey: true,
      freeAudioUsedToday: true,
      freeAudioDailyLimit: true,
      paidAudioTokenCost: true,
    },
  });
}

export async function attachLoginMetadata(userId, provider) {
  return await prisma.user.update({
    where: { id: userId },
    data: {
      lastLoginAt: new Date(),
      lastLoginProvider: provider,
    },
  });
}

export async function buildMePayload(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      wallet: true,
      accounts: true,
    },
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    lastLoginAt: toIsoStringOrNull(user.lastLoginAt),
    lastLoginProvider: user.lastLoginProvider,
    wallet: user.wallet
      ? {
          balanceTokens: user.wallet.balanceTokens,
          reservedTokens: user.wallet.reservedTokens,
          lifetimeTopUp: user.wallet.lifetimeTopUp,
          lifetimeSpent: user.wallet.lifetimeSpent,
        }
      : null,
    freeAudio: {
      dateKey: user.freeAudioDateKey ?? getDateKey(),
      usedToday: user.freeAudioUsedToday ?? 0,
      dailyLimit: user.freeAudioDailyLimit ?? DEFAULT_DAILY_FREE_AUDIO_LIMIT,
      paidAudioTokenCost: user.paidAudioTokenCost ?? DEFAULT_PAID_AUDIO_TOKEN_COST,
    },
    providers: user.accounts.map((account) => account.provider),
  };
}
