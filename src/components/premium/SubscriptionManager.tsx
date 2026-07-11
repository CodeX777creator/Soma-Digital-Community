'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { collection, query, where, onSnapshot, QueryConstraint } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GlassCard } from '@/components/ui/glass-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from 'lucide-react';

interface Subscription {
  id: string;
  planId: string;
  status: string;
  currentPeriodStart?: any;
  currentPeriodEnd?: any;
  createdAt: any;
  cancelledAt?: any;
}

export function SubscriptionManager() {
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const { cancelSubscription, cancelLoading } = useSubscription();
  const { toast } = useToast();

    useEffect(() => {
    if (!user?.uid || !db) {
      setLoading(false);
      return;
    }

    const constraints: QueryConstraint[] = [where('userId', '==', user.uid)];
    const q = query(collection(db, 'subscriptions'), ...constraints);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const subs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Subscription[];

      setSubscriptions(subs);
      setLoading(false);
    });

    return unsubscribe;
  }, [user?.uid]);

  const handleCancelSubscription = async (subscriptionId: string) => {
    try {
      await cancelSubscription(subscriptionId);
      toast({
        title: 'Subscription cancelled',
        description: 'Your subscription has been cancelled. You will retain access until the end of your billing period.',
      });
    } catch {
      toast({
        title: 'Failed to cancel',
        description: 'Please try again or contact support.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <GlassCard className="p-8 text-center">
        <p className="text-muted-foreground">No active subscriptions. Choose a paid plan to unlock premium features.</p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {subscriptions.map((sub) => {
        const isActive = sub.status === 'active';
        const endDate = sub.currentPeriodEnd?.toDate?.() || new Date();

        return (
          <GlassCard
            key={sub.id}
            className="p-6 border-l-4 border-l-primary flex flex-col md:flex-row md:items-center md:justify-between gap-6"
          >
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-bold capitalize">{sub.planId} Plan</h3>
                <Badge
                  className={`${
                    isActive
                      ? 'bg-green-500/20 text-green-300 border-green-500/30'
                      : 'bg-red-500/20 text-red-300 border-red-500/30'
                  }`}
                >
                  {isActive ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Active
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {sub.status}
                    </>
                  )}
                </Badge>
              </div>

              <div className="space-y-1 text-sm text-muted-foreground">
                {isActive && sub.currentPeriodEnd && (
                  <p>
                    Renews on{' '}
                    <span className="text-foreground font-medium">
                      {format(endDate, 'MMM d, yyyy')}
                    </span>
                  </p>
                )}
                {sub.createdAt && (
                  <p>
                    Started on{' '}
                    <span className="text-foreground font-medium">
                      {format(sub.createdAt.toDate?.() || new Date(), 'MMM d, yyyy')}
                    </span>
                  </p>
                )}
              </div>
            </div>

            {isActive && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    className="border border-red-500/20 hover:bg-red-500/10 text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Cancel Subscription
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogTitle>Cancel Subscription?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You will lose access to premium features at the end of your current billing period.
                    This action cannot be undone.
                  </AlertDialogDescription>
                  <div className="flex gap-3 justify-end">
                    <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleCancelSubscription(sub.id)}
                      disabled={cancelLoading}
                      className="bg-red-500 hover:bg-red-600"
                    >
                      {cancelLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Cancelling...
                        </>
                      ) : (
                        'Cancel'
                      )}
                    </AlertDialogAction>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </GlassCard>
        );
      })}
    </div>
  );
}
