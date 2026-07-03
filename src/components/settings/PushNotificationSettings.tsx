"use client";

import { useState, useEffect } from 'react';
import { Bell, BellOff, Power, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { GlassCard } from '@/components/ui/glass-card';
import { Badge } from '@/components/ui/badge';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function PushNotificationSettings() {
  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
    requestPermission,
  } = usePushNotifications();

  const { toast } = useToast();
  const [isToggling, setIsToggling] = useState(false);

  const handleToggle = async (enabled: boolean) => {
    setIsToggling(true);
    try {
      if (enabled) {
        await subscribe();
      } else {
        await unsubscribe();
      }
    } finally {
      setIsToggling(false);
    }
  };

  const handleRequestPermission = async () => {
    const granted = await requestPermission();
    if (granted) {
      // Auto-subscribe after permission is granted
      setTimeout(() => {
        subscribe();
      }, 500);
    }
  };

  if (!isSupported) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-start gap-4">
          <XCircle className="w-6 h-6 text-muted-foreground mt-1" />
          <div className="flex-1">
            <h3 className="font-semibold text-white">Push Notifications</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Push notifications are not supported in your browser or on this device.
            </p>
          </div>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6 text-primary" />
            <h3 className="font-semibold text-white">Push Notifications</h3>
            {isSubscribed && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Active
              </Badge>
            )}
          </div>
          
          <p className="text-sm text-muted-foreground mt-2">
            Receive real-time updates about your activities, community interactions, and important announcements directly to your device.
          </p>

          <div className="mt-4 space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="font-medium">Status:</span>
              <span className={isSubscribed ? 'text-green-400' : 'text-yellow-400'}>
                {isSubscribed ? 'Enabled' : permission === 'denied' ? 'Blocked' : 'Not enabled'}
              </span>
            </div>
            {permission === 'denied' && (
              <div className="flex items-center gap-2 text-yellow-400">
                <XCircle className="w-3 h-3" />
                <span>Permission denied. Please enable in your browser settings.</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-3">
          {permission === 'default' ? (
            <Button
              onClick={handleRequestPermission}
              disabled={isLoading}
              variant="outline"
              className="h-10"
            >
              <Power className="w-4 h-4 mr-2" />
              {isLoading ? 'Enabling...' : 'Enable'}
            </Button>
          ) : (
            <div className="flex items-center space-x-2">
              <Switch
                checked={isSubscribed}
                onCheckedChange={handleToggle}
                disabled={isLoading || isToggling || permission === 'denied'}
              />
              <div className="text-sm">
                <span className="font-medium text-white">
                  {isSubscribed ? 'Notifications on' : 'Notifications off'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-red-400">
            <XCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {permission === 'denied' && (
        <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <div className="text-sm text-yellow-400">
            <strong>Permission denied:</strong> You've blocked notifications. 
            Please enable them in your browser settings to receive push notifications.
          </div>
        </div>
      )}
    </GlassCard>
  );
}