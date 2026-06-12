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
import { Bot, Loader2, MessageSquare, Plus, Send } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
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

export default function MentorPage() {
  const { user } = useAuth();
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
      console.log('Calling /api/mentor/chat with:', { message, historyLength: history.length });
      const response = await fetch('/api/mentor/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          message,
          history,
        } as MentorChatApiRequest),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data: MentorChatApiResponse = await response.json();
      console.log('API response received:', { resultLength: data.result?.length });

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
      
      console.error('Mentor chat error:', err);
      setError(messageText);
      toast({ title: "Mentor error", description: messageText, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="flex h-[calc(100vh-9rem)] flex-col gap-4 lg:flex-row">
          <GlassCard className="hidden w-80 flex-col overflow-hidden p-4 lg:flex">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="h-4 w-4 text-primary" />
                Mentor Threads
              </div>
              <Button size="icon" variant="ghost" onClick={handleNewThread} aria-label="New mentor thread">
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
                      "w-full rounded-lg border p-3 text-left text-sm transition-colors",
                      activeThreadId === thread.id
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-white/10 bg-white/5 text-white/80 hover:border-white/20"
                    )}
                  >
                    <span className="line-clamp-2">{thread.title}</span>
                  </button>
                ))}

                {threads.length === 0 && (
                  <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                    Start your first mentor conversation.
                  </p>
                )}
              </div>
            </ScrollArea>
          </GlassCard>

          <GlassCard className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">AI Business Mentor</h1>
                  <p className="text-xs text-muted-foreground">Strategy, marketing, product, and scaling advice</p>
                </div>
              </div>
              <Button className="lg:hidden" size="sm" variant="outline" onClick={handleNewThread}>
                <Plus className="mr-2 h-4 w-4" />
                New
              </Button>
            </div>

            {error && (
              <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <ScrollArea className="flex-1 p-4">
              <div className="mx-auto flex max-w-3xl flex-col gap-4">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
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
                          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
                          message.role === "user"
                            ? "bg-primary text-white"
                            : "border border-white/10 bg-white/5 text-white/90"
                        )}
                      >
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>
                    </div>
                  ))
                )}

                {isSending && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      Thinking...
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            <form onSubmit={sendMessage} className="border-t border-white/10 p-4">
              <div className="mx-auto flex max-w-3xl gap-3">
                <Input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask for your next practical move..."
                  disabled={isSending}
                  className="h-12 bg-white/5"
                />
                <Button type="submit" disabled={isSending || !input.trim()} className="h-12 px-4">
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  <span className="sr-only">Send</span>
                </Button>
              </div>
            </form>
          </GlassCard>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
