import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { processTopUp, type TopUpRequest } from "../api/topup";

interface TopUpOption {
  id: string;
  tokens: number;
  price: string;
  description: string;
  popular?: boolean;
}

const topUpOptions: TopUpOption[] = [
  { id: "small", tokens: 10, price: "$5.00", description: "10 tokens" },
  { id: "medium", tokens: 25, price: "$10.00", description: "25 tokens (Popular)", popular: true },
  { id: "large", tokens: 50, price: "$18.00", description: "50 tokens (Best value)" },
  { id: "custom", tokens: 0, price: "Custom", description: "Enter custom amount" },
];

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export function ProfilePage() {
  const { user } = useAuth();
  const [selectedOption, setSelectedOption] = useState<string>("medium");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Reset message after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleTopUp = async () => {
    if (!user) return;

    const selected = topUpOptions.find(opt => opt.id === selectedOption);
    const tokens = selected?.id === "custom" 
      ? parseInt(customAmount) || 0 
      : (selected?.tokens || 0);

    if (tokens <= 0) {
      setMessage({ type: "error", text: "Please enter a valid token amount" });
      return;
    }

    setIsProcessing(true);
    setMessage(null);

    try {
      const topUpRequest: TopUpRequest = {
        amountTokens: tokens,
        paymentMethod: "credit_card", // For now, hardcoded
        memo: `Top up ${tokens} tokens from profile page`,
      };

      const result = await processTopUp(topUpRequest);
      
      if (result.ok) {
        setMessage({ 
          type: "success", 
          text: `Successfully added ${tokens} tokens to your account! New balance: ${result.wallet.balanceTokens} tokens.` 
        });
        
        if (selected?.id === "custom") {
          setCustomAmount("");
        }
        
        // Refresh user data to update wallet balance
        // In a real app, you would call refreshUser() from AuthContext
        // For now, we'll just show a success message
      } else {
        setMessage({ 
          type: "error", 
          text: "Top-up failed. Please try again or contact support." 
        });
      }
    } catch (error) {
      console.error("Top-up error:", error);
      setMessage({ 
        type: "error", 
        text: error instanceof Error ? error.message : "Top-up failed. Please try again." 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!user) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="eyebrow">Profile</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">User Profile</h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">Please log in to view and manage your profile.</p>
        </div>
      </div>
    );
  }

  const selectedTopUp = topUpOptions.find(opt => opt.id === selectedOption);
  const tokensToAdd = selectedTopUp?.id === "custom" 
    ? parseInt(customAmount) || 0 
    : (selectedTopUp?.tokens || 0);

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="space-y-4">
        <p className="eyebrow">Profile & Wallet</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Your account details</h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-300">Manage your tokens, view usage history, and top up your balance.</p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Left column: User info and wallet */}
        <div className="space-y-6">
          {/* User info panel */}
          <div className="panel space-y-6">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Account Information</h2>
              
              <div className="flex items-center gap-4">
                <img
                  className="h-16 w-16 rounded-full border-2 border-white/10 object-cover"
                  src={user.avatarUrl || "https://ui-avatars.com/api/?name=RBX+Royale&background=8f5bff&color=fff"}
                  alt={user.displayName || user.email || "User"}
                  onError={(event) => {
                    if (event.currentTarget.src !== "https://ui-avatars.com/api/?name=RBX+Royale&background=8f5bff&color=fff") {
                      event.currentTarget.src = "https://ui-avatars.com/api/?name=RBX+Royale&background=8f5bff&color=fff";
                    }
                  }}
                />
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-white">{user.displayName || user.fullName || user.email || "User"}</p>
                  <p className="text-sm text-slate-400">{user.email}</p>
                  <p className="text-sm text-slate-400">
                    Last login: {user.lastLoginAt ? formatDate(user.lastLoginAt) : "Never"}
                  </p>
                </div>
              </div>
            </div>

            {/* Wallet summary */}
            <div className="space-y-4 border-t border-white/10 pt-6">
              <h2 className="text-xl font-semibold text-white">Token Wallet</h2>
              
              <div className="rounded-2xl bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 p-6 ring-1 ring-white/10">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-sm text-slate-300">Current Balance</p>
                    <p className="text-4xl font-bold text-white">
                      {user.wallet?.balanceTokens ?? 0}
                      <span className="ml-2 text-lg font-semibold text-violet-200">tokens</span>
                    </p>
                    <p className="text-sm text-slate-400">
                      {user.wallet?.availableTokens ?? user.wallet?.balanceTokens ?? 0} available • {user.wallet?.reservedTokens ?? 0} reserved
                    </p>
                  </div>
                  <div className="rounded-full bg-violet-500/20 p-3">
                    <svg className="h-8 w-8 text-violet-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Usage stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm text-slate-400">Free Audio Today</p>
                  <p className="text-2xl font-bold text-white">
                    {user.freeAudio?.usedToday ?? 0}<span className="text-base font-normal text-slate-300">/</span>{user.freeAudio?.dailyLimit ?? 3}
                  </p>
                  <p className="text-xs text-slate-400">Resets daily</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm text-slate-400">Token Cost</p>
                  <p className="text-2xl font-bold text-white">
                    {user.freeAudio?.paidAudioTokenCost ?? 1}<span className="text-base font-normal text-slate-300"> token/audio</span>
                  </p>
                  <p className="text-xs text-slate-400">After free quota</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Top-up section */}
        <div className="space-y-6">
          <div className="panel space-y-6">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Top Up Tokens</h2>
              <p className="text-slate-300">Add more tokens to your account to continue processing audio after your daily free quota.</p>
            </div>

            {/* Top-up options */}
            <div className="space-y-4">
              <div className="grid gap-3">
                {topUpOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedOption(option.id)}
                    className={`flex items-center justify-between rounded-xl border p-4 text-left transition ${
                      selectedOption === option.id
                        ? "border-violet-400 bg-violet-500/15 ring-1 ring-violet-400/30"
                        : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-white">
                          {option.tokens > 0 ? `${option.tokens} tokens` : "Custom amount"}
                        </p>
                        {option.popular && (
                          <span className="rounded-full bg-violet-500/20 px-2 py-1 text-xs font-medium text-violet-200">
                            Popular
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-400">{option.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-white">{option.price}</p>
                      {option.id !== "custom" && (
                        <p className="text-sm text-slate-400">
                          ${(parseFloat(option.price.replace("$", "")) / option.tokens).toFixed(2)}/token
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* Custom amount input */}
              {selectedOption === "custom" && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    Enter custom token amount
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value.replace(/\D/g, ""))}
                      className="flex-1 rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                      placeholder="Enter number of tokens"
                    />
                    <span className="text-slate-300">tokens</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">
                    Price: ${(tokensToAdd * 0.4).toFixed(2)} (${0.4}/token)
                  </p>
                </div>
              )}

              {/* Selected option summary */}
              {selectedOption !== "custom" && selectedTopUp && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-400">Selected plan</p>
                      <p className="font-semibold text-white">{selectedTopUp.tokens} tokens</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-400">Total cost</p>
                      <p className="font-semibold text-white">{selectedTopUp.price}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Message display */}
              {message && (
                <div className={`rounded-xl border p-4 ${
                  message.type === "success" 
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-200"
                }`}>
                  <p className="font-medium">{message.text}</p>
                </div>
              )}

              {/* Top-up button */}
              <button
                type="button"
                onClick={handleTopUp}
                disabled={isProcessing || (selectedOption === "custom" && tokensToAdd <= 0)}
                className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-4 font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.25)] transition hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  `Top Up ${tokensToAdd > 0 ? `• ${tokensToAdd} tokens` : ""}`
                )}
              </button>

              {/* Help text */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-slate-300">
                  <span className="font-medium text-white">ℹ️ How it works:</span> After your daily {user.freeAudio?.dailyLimit ?? 3} free audio uploads, each additional upload costs {user.freeAudio?.paidAudioTokenCost ?? 1} token. Top up your balance to continue uploading.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}