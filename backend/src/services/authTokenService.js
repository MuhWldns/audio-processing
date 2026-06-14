import jwt from "jsonwebtoken";

const ALGORITHM = "HS256";

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
};

const getAccessTtlSeconds = () => {
  const days = Number(process.env.ACCESS_TOKEN_TTL_DAYS) || 7;
  return days * 24 * 60 * 60;
};

export function signAccessToken(userId, role) {
  return jwt.sign({ sub: userId, role }, getJwtSecret(), {
    algorithm: ALGORITHM,
    expiresIn: getAccessTtlSeconds(),
  });
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, getJwtSecret(), { algorithms: [ALGORITHM] });
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      const e = new Error("token_expired");
      e.code = "token_expired";
      throw e;
    }
    const e = new Error("invalid_token");
    e.code = "invalid_token";
    throw e;
  }
}
