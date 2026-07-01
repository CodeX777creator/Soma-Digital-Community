"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useOnlineStatus } from "@/lib/offline";
import { Button } from "./button";
import { offlineQueue } from "@/lib/offline";

export function NetworkStatusIndicator() {
  const { isOnline, wasOffline } = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const [queueSize, setQueueSize] = useState(0);

  useEffect(() => {
    if (wasOffline) {
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [wasOffline]);

  useEffect(() => {
    // Update queue size periodically
    const interval = setInterval(() => {
      setQueueSize(offlineQueue.getQueueSize());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRetryQueue = () => {
    offlineQueue.processQueue();
  };

  return (
    <>
      {/* Offline Indicator */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-50 bg-red-500/90 backdrop-blur-sm text-white px-4 py-2"
          >
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-2">
                <WifiOff className="w-4 h-4" />
                <span className="text-sm font-medium">
                  You&apos;re offline. Some features may be unavailable.
                </span>
              </div>
              {queueSize > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleRetryQueue}
                  className="text-white hover:bg-white/20 h-8"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Retry {queueSize} pending
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reconnected Notification */}
      <AnimatePresence>
        {showReconnected && isOnline && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-50 bg-green-500/90 backdrop-blur-sm text-white px-4 py-2"
          >
            <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
              <Wifi className="w-4 h-4" />
              <span className="text-sm font-medium">
                You&apos;re back online!
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function NetworkStatusBadge() {
  const { isOnline } = useOnlineStatus();

  if (isOnline) return null;

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-medium border border-red-500/30">
      <WifiOff className="w-3 h-3" />
      Offline
    </span>
  );
}
