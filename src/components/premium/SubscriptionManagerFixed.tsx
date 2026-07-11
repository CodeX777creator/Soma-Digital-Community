'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { collection, query, where, onSnapshot, QueryConstraint, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GlassCard } from '@/components/ui/glass-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from '@/components/ui/alert-dialog';
import { format, isAfter } from 'date-fns';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, CheckCircle2, Loader2, Trash2, CreditCard } from 'lucide-react';

interface Subscription {
  id: string;
  planId: string;
  status: 'active' | 'cancelled' | 'past_due' | 'expired' | 'suspended' | 'approval_pending';
  provider: 'paypal' | 'paystack';
  currentPeriodStart?: any;
  currentPeriodEnd?: any;
  createdAt: any;
  cancelledAt?: any;
  paystackReference?: string;
  paypalSubscriptionId?: string;
}

/**
 * SubscriptionManager - Unified subscription management for PayPal and Paystack
 * 
 * Features:
 * - Shows all subscriptions from both providers
 * - Real-time updates via Firestore listeners
 * - Grace period handling (access until period end)
 * - Proper error handling and loading states
 */
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

    // Query all subscriptions for the user, ordered by creation date
    const constraints: QueryConstraint[] = [
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    ];
    
    const q = query(collection(db, 'subscriptions'), ...constraints);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const subs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Subscription[];

      setSubscriptions(subs);
      setLoading(false);
    }, (error) => {
      console.error('Subscription listener error:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const handleCancelSubscription = async (subscription: Subscription) => {
    try {
      await cancelSubscription(subscription.id);
      
      toast({
        title: 'Subscription cancelled',
        description: subscription.currentPeriodEnd 
          ? `Your subscription has been cancelled. You'll retain access until ${format(
              subscription.currentPeriodEnd.toDate?.() || new Date(subscription.currentPeriodEnd), 
              'MMM d, yyyy'
            )}.`
          : 'Your subscription has been cancelled.',
      });
    } catch (error) {
      toast({
        title: 'Failed to cancel',
        description: error instanceof Error ? error.message : 'Please try again or contact support.',
        variant: 'destructive',
      });
    }
  };

  // Check if user has active access (including grace period)
  const hasActiveAccess = subscriptions.some(sub => {
    if (sub.status !== 'active' && sub.status !== 'cancelled') return false;
    if (sub.status === 'cancelled' && sub.currentPeriodEnd) {
      // Check if still in grace period
      const endDate = sub.currentPeriodEnd.toDate?.() || new Date(sub.currentPeriodEnd);
      return isAfter(endDate, new Date());
    }
    return sub.status === 'active';
  });

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
        <CreditCard className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-muted-foreground">No active subscriptions.</p>
        <p className="text-sm text-muted-foreground mt-2">
          Choose a paid plan when you are ready to unlock premium features.
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {subscriptions.map((sub) => {
        const isActive = sub.status === 'active';
        const isCancelled = sub.status === 'cancelled';
        const isPastDue = sub.status === 'past_due';
        const endDate = sub.currentPeriodEnd?.toDate?.() || null;
        const isInGracePeriod = isCancelled && endDate && isAfter(endDate, new Date());
        const hasAccess = isActive || isInGracePeriod;

        return (
          <GlassCard
            key={sub.id}
            className={`p-6 border-l-4 flex flex-col md:flex-row md:items-center md:justify-between gap-6 ${
              hasAccess ? 'border-l-primary' : 'border-l-gray-500'
            }`}
          >
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h3 className="text-lg font-bold capitalize">{sub.planId} Plan</h3>
                <Badge
                  className={`${
                    isActive
                      ? 'bg-green-500/20 text-green-300 border-green-500/30'
                      : isInGracePeriod
                      ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                      : isPastDue
                      ? 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                      : 'bg-red-500/20 text-red-300 border-red-500/30'
                  }`}
                >
                  {isActive ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Active
                    </>
                  ) : isInGracePeriod ? (
                    <>
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Cancelled (Access until {format(endDate, 'MMM d')})
                    </>
                  ) : isPastDue ? (
                    <>
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Payment Failed
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {sub.status}
                    </>
                  )}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {sub.provider === 'paypal' ? 'PayPal' : 'Paystack'}
                </Badge>
              </div>

              <div className="space-y-1 text-sm text-muted-foreground">
                {hasAccess && endDate && (
                  <p>
                    {isCancelled ? 'Access until' : 'Renews on'}{' '}
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
                {sub.paystackReference && (
                  <p className="text-xs text-muted-foreground">
                    Ref: {sub.paystackReference}
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
                    disabled={cancelLoading}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Cancel Subscription
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogTitle>Cancel Subscription?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You will lose access to premium features at the end of your current billing period
                    ({endDate ? format(endDate, 'MMM d, yyyy') : 'soon'}).
                    <br /><br />
                    This action cannot be undone.
                  </AlertDialogDescription>
                  <div className="flex gap-3 justify-end">
                    <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleCancelSubscription(sub)}
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

            {isPastDue && (
              <Button
                variant="outline"
                className="border-orange-500/20 text-orange-400 hover:bg-orange-500/10"
                onClick={() => window.open('/settings/billing', '_self')}
              >
                Update Payment
              </Button>
            )}
          </GlassCard>
        );
      })}
      
      {!hasActiveAccess && (
        <GlassCard className="p-6 text-center border-dashed border-2">
          <p className="text-muted-foreground mb-4">
            No active subscription. Choose a paid plan to access premium features.
          </p>
          <Button asChild className="blue-glow">
            <a href="/#pricing">View Plans</a>
          </Button>
        </GlassCard>
      )}
    </div>
  );
}
