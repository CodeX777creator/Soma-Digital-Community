"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { ArrowRight, Bot, CheckCircle2, Loader2, Lock, MessageSquare, Plus, Send, Sparkles } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { getEffectiveUserTier } from "@/lib/tier";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: unknown;
}

interface ChatThread {
  id: string;
  title: string;
  lastUpdated: unknown;
  userId: string;
}

interface MentorChatApiRequest {
  message: string;
  history: Array<{ role: ChatRole; content: string }>;
  threadId: string;
}

interface MentorChatApiResponse {
  result: string;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "I am your AI business mentor. Ask me about strategy, marketing, product development, or scaling, and I will keep it concise and actionable.",
  timestamp: new Date(),
};

function createThreadTitle(message: string): string {
  const title = message.trim().replace(/\s+/g, " ").slice(0, 60);
  return title || "Mentor conversation";
}

function hasMentorAccess(userData: Record<string, any> | null): boolean {
  const tier = getEffectiveUserTier(userData);
  return tier === "pro" || tier === "elite" || userData?.isAdmin === true || userData?.role === "admin";
}

export default function MentorPage() {
  const { user, userData } = useAuth();
  const { toast } = useToast();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid || !db) return;

    const threadsQuery = query(
      collection(db, "users", user.uid, "mentorHistory"),
      orderBy("lastUpdated", "desc")
    );

    return onSnapshot(
      threadsQuery,
      (snapshot) => {
        const nextThreads = snapshot.docs.map((threadDoc) => {
          const data = threadDoc.data();
          return {
            id: threadDoc.id,
            title: typeof data.title === "string" ? data.title : "Mentor conversation",
            lastUpdated: data.lastUpdated,
            userId: typeof data.userId === "string" ? data.userId : user.uid,
          };
        });

        setThreads(nextThreads);
        setActiveThreadId((current) => current || nextThreads[0]?.id || null);
      },
      (snapshotError) => {
        setError(snapshotError.message);
      }
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || !activeThreadId || !db) {
      setMessages([WELCOME_MESSAGE]);
      return;
    }

    setLoadingMessages(true);
    const messagesQuery = query(
      collection(db, "users", user.uid, "mentorHistory", activeThreadId, "messages"),
      orderBy("timestamp", "asc")
    );

    return onSnapshot(
      messagesQuery,
      (snapshot) => {
        const nextMessages = snapshot.docs.map((messageDoc) => {
          const data = messageDoc.data();
          const role: ChatRole = data.role === "assistant" ? "assistant" : "user";
          return {
            id: messageDoc.id,
            role,
            content: typeof data.content === "string" ? data.content : "",
            timestamp: data.timestamp,
          };
        });

        setMessages(nextMessages.length > 0 ? nextMessages : [WELCOME_MESSAGE]);
        setLoadingMessages(false);
      },
      (snapshotError) => {
        setLoadingMessages(false);
        setError(snapshotError.message);
      }
    );
  }, [activeThreadId, user?.uid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  const createThread = async (firstMessage?: string): Promise<string> => {
    if (!user?.uid || !db) {
      throw new Error("Please sign in to chat with your mentor.");
    }

    const threadRef = doc(collection(db, "users", user.uid, "mentorHistory"));
    await setDoc(threadRef, {
      title: firstMessage ? createThreadTitle(firstMessage) : "New mentor conversation",
      userId: user.uid,
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
    });

    setActiveThreadId(threadRef.id);
    return threadRef.id;
  };

  const handleNewThread = async () => {
    try {
      setError(null);
      await createThread();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create a new thread.";
      setError(message);
      toast({ title: "New thread failed", description: message, variant: "destructive" });
    }
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user?.uid || !db || !input.trim() || isSending) return;

    const message = input.trim();
    setInput("");
    setError(null);
    setIsSending(true);

    try {
      const threadId = activeThreadId || (await createThread(message));
      const threadRef = doc(db, "users", user.uid, "mentorHistory", threadId);
      const messagesRef = collection(threadRef, "messages");

      // Save user message to Firestore
      await addDoc(messagesRef, {
        role: "user",
        content: message,
        timestamp: serverTimestamp(),
        type: "text",
      });

      await updateDoc(threadRef, {
        title: createThreadTitle(message),
        lastUpdated: serverTimestamp(),
      });

      // Build history from current messages (excluding welcome message if it's the only one)
      const history = messages
        .filter(m => m.id !== "welcome")
        .map(m => ({
          role: m.role,
          content: m.content,
        }));

      // Get Firebase ID token for authentication
      const idToken = await user.getIdToken();

      // Call the Next.js API route with Genkit/Kimi
      const response = await fetch('/api/mentor/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
      body: JSON.stringify({
        message,
        history,
        threadId,
      } as MentorChatApiRequest),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data: MentorChatApiResponse = await response.json();

      // Save AI response to Firestore
      await addDoc(messagesRef, {
        role: "assistant",
        content: data.result,
        timestamp: serverTimestamp(),
        type: "text",
      });

      await updateDoc(threadRef, {
        lastUpdated: serverTimestamp(),
      });
    } catch (err: any) {
      let messageText = "The AI mentor could not respond. Please try again.";
      
      if (err?.message) {
        messageText = err.message;
      }
      
      setError(messageText);
      toast({ title: "Mentor error", description: messageText, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  if (!hasMentorAccess(userData as Record<string, any> | null)) {
    return (
      <ProtectedRoute>
        <AppLayout>
          <div className="mx-auto flex min-h-[70vh] max-w-4xl items-center justify-center px-4">
            <div className="relative w-full overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#151A2E]/80 p-8 text-center shadow-2xl shadow-black/30 backdrop-blur md:p-12">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_0%,rgba(79,157,255,.24),transparent_34%),radial-gradient(circle_at_78%_18%,rgba(139,92,246,.34),transparent_32%)]" />
              <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.05]">
                <Lock className="h-7 w-7 text-[#4F9DFF]" />
              </div>
              <div className="relative mx-auto mt-6 max-w-2xl space-y-3">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#7E8799]">AI Mentor</p>
                <h1 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">Business Mentor is for Pro and Elite</h1>
                <p className="text-sm leading-6 text-[#BFC6D4] md:text-base">
                  Upgrade when you are ready for guided strategy, smarter execution plans, persistent memory, and practical next steps.
                </p>
              </div>
              <div className="relative mx-auto mt-8 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
                {["Strategy guidance", "Persistent memory", "Action plans"].map((item) => (
                  <div key={item} className="rounded-[16px] border border-white/[0.08] bg-[#090B13]/60 p-4 text-sm text-[#BFC6D4]">
                    <CheckCircle2 className="mb-3 h-4 w-4 text-[#22C55E]" />
                    {item}
                  </div>
                ))}
              </div>
              <Button asChild className="relative mt-8 h-12 rounded-full bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] px-6 text-white shadow-lg shadow-[#5B5FFF]/25">
                <a href="/dashboard?upgrade=pro">
                  Upgrade to Pro
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </AppLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="grid h-[calc(100vh-8rem)] min-h-[680px] gap-6 xl:grid-cols-[320px_1fr_340px]">
          <aside className="hidden flex-col overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-4 shadow-xl shadow-black/20 backdrop-blur xl:flex">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <MessageSquare className="h-4 w-4 text-[#4F9DFF]" />
                  Mentor Threads
                </div>
                <p className="mt-1 text-xs text-[#7E8799]">{threads.length} saved conversations</p>
              </div>
              <Button size="icon" variant="outline" className="rounded-full border-white/[0.08] bg-white/[0.04]" onClick={handleNewThread} aria-label="New mentor thread">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-2 pr-3">
                {threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setActiveThreadId(thread.id)}
                    className={cn(
                      "w-full rounded-[14px] border p-3 text-left text-sm transition-colors",
                      activeThreadId === thread.id
                        ? "border-[#5B5FFF]/60 bg-[#5B5FFF]/10 text-white"
                        : "border-white/[0.08] bg-[#090B13]/55 text-[#BFC6D4] hover:border-white/[0.16]"
                    )}
                  >
                    <span className="line-clamp-2">{thread.title}</span>
                  </button>
                ))}

                {threads.length === 0 && (
                  <p className="rounded-[14px] border border-dashed border-white/[0.12] bg-white/[0.03] px-4 py-8 text-center text-sm text-[#BFC6D4]">
                    Start your first mentor conversation.
                  </p>
                )}
              </div>
            </ScrollArea>
          </aside>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 shadow-2xl shadow-black/25 backdrop-blur">
            <div className="relative overflow-hidden border-b border-white/[0.08] p-5 md:p-6">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(79,157,255,.18),transparent_30%),radial-gradient(circle_at_90%_12%,rgba(139,92,246,.20),transparent_34%)]" />
              <div className="relative flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] shadow-lg shadow-[#5B5FFF]/20">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-[#7E8799]">Persistent advisor</p>
                  <h1 className="text-xl font-semibold tracking-tight text-white">AI Business Mentor</h1>
                  <p className="text-xs text-[#BFC6D4]">Strategy, marketing, product, and scaling advice</p>
                </div>
              </div>
              <Button className="xl:hidden rounded-full border-white/[0.08] bg-white/[0.04]" size="sm" variant="outline" onClick={handleNewThread}>
                <Plus className="mr-2 h-4 w-4" />
                New
              </Button>
              </div>
            </div>

            {error && (
              <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <ScrollArea className="flex-1 p-4">
              <div className="mx-auto flex max-w-3xl flex-col gap-4">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-12 text-sm text-[#BFC6D4]">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading conversation...
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-[18px] px-4 py-3 text-sm leading-relaxed shadow-sm",
                          message.role === "user"
                            ? "bg-gradient-to-br from-[#5B5FFF] to-[#8B5CF6] text-white"
                            : "border border-white/[0.08] bg-[#090B13]/70 text-[#F8FAFC]"
                        )}
                      >
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>
                    </div>
                  ))
                )}

                {isSending && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-[18px] border border-white/[0.08] bg-[#090B13]/70 px-4 py-3 text-sm text-[#BFC6D4]">
                      <Loader2 className="h-4 w-4 animate-spin text-[#4F9DFF]" />
                      Thinking...
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            <form onSubmit={sendMessage} className="border-t border-white/[0.08] bg-[#090B13]/40 p-4">
              <div className="mx-auto flex max-w-3xl gap-3 rounded-[18px] border border-white/[0.08] bg-[#090B13]/70 p-2 shadow-xl shadow-black/20">
                <Input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask for your next practical move..."
                  disabled={isSending}
                  className="h-12 border-0 bg-transparent text-white placeholder:text-[#7E8799] focus-visible:ring-0"
                />
                <Button type="submit" disabled={isSending || !input.trim()} className="h-12 rounded-2xl bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] px-4 text-white shadow-lg shadow-[#5B5FFF]/20">
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  <span className="sr-only">Send</span>
                </Button>
              </div>
            </form>
          </section>

          <aside className="hidden space-y-6 xl:block">
            <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-5 shadow-xl shadow-black/20 backdrop-blur">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#8B5CF6]" />
                <h2 className="text-base font-semibold text-white">Mentor focus</h2>
              </div>
              <div className="mt-4 space-y-3">
                {["Clarify the next move", "Turn advice into action", "Keep business context persistent"].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-[14px] border border-white/[0.08] bg-[#090B13]/60 p-3 text-sm text-[#BFC6D4]">
                    <CheckCircle2 className="h-4 w-4 text-[#22C55E]" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-5 shadow-xl shadow-black/20 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.22em] text-[#7E8799]">Suggested prompts</p>
              <div className="mt-4 space-y-2">
                {[
                  "What should I focus on this week?",
                  "Audit my offer and positioning.",
                  "Give me a 7-day growth plan.",
                  "Turn this idea into a launch plan.",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="w-full rounded-[14px] border border-white/[0.08] bg-[#090B13]/60 p-3 text-left text-sm text-[#BFC6D4] transition hover:border-[#5B5FFF]/50 hover:text-white"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
