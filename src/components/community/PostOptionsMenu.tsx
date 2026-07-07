"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { 
  MoreHorizontal, 
  Edit3, 
  Trash2, 
  Flag, 
  Link as LinkIcon, 
  Pin,
  Ban,
  EyeOff
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/AuthProvider";
import { Post, postService } from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Time limit for editing posts (30 minutes in milliseconds)
const EDIT_TIME_LIMIT = 60 * 60 * 1000;
const UNDO_TIMEOUT = 5000; // 5 seconds

interface PostOptionsMenuProps {
  post: Post;
  onEdit?: () => void;
  onDelete?: (postId: string, post: Post) => void;
  onPin?: () => void;
  isAdmin?: boolean;
}

export function PostOptionsMenu({ 
  post, 
  onEdit, 
  onDelete, 
  onPin,
  isAdmin = false 
}: PostOptionsMenuProps) {
  const { user, userData } = useAuth();
  const { toast, dismiss } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  
  const isAuthor = user?.uid === post.authorId;
  
  // Check if post is within edit time limit
  const canEditPost = () => {
    if (!isAuthor) return false;
    if (isAdmin) return true; // Admins can always edit
    
    const createdAt = post.createdAt?.toDate?.() || new Date(post.createdAt);
    const timeElapsed = Date.now() - createdAt.getTime();
    return timeElapsed <= EDIT_TIME_LIMIT;
  };
  
  const canEdit = canEditPost();
  const canDelete = isAuthor || isAdmin;
  const canPin = isAdmin;
  
  // Calculate remaining edit time for display
  const getRemainingEditTime = () => {
    if (!isAuthor || isAdmin) return null;
    const createdAt = post.createdAt?.toDate?.() || new Date(post.createdAt);
    const timeElapsed = Date.now() - createdAt.getTime();
    const remaining = EDIT_TIME_LIMIT - timeElapsed;
    if (remaining <= 0) return null;
    
    const minutes = Math.floor(remaining / 60000);
    return minutes;
  };
  
  const remainingMinutes = getRemainingEditTime();

  // Animation variants for dropdown
  const menuVariants = {
    hidden: { opacity: 0, scale: 0.95, y: -8 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.15, ease: "easeOut" } },
    exit: { opacity: 0, scale: 0.95, y: -8, transition: { duration: 0.1 } }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/community?post=${post.id}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied!",
      description: "Post link copied to clipboard",
    });
  };

  const handleReport = () => {
    toast({
      title: "Report submitted",
      description: "Thank you for helping keep our community safe.",
    });
  };

  const handleHide = () => {
    toast({
      title: "Post hidden",
      description: "You won't see this post in your feed.",
    });
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this post? This action cannot be undone.")) {
      return;
    }
    
    setIsDeleting(true);
    try {
      await postService.deletePost(post.id);
      
      // Show undo toast with 5 second timeout
      const toastObj = toast({
        title: "Post deleted",
        description: "Your post has been removed.",
        duration: UNDO_TIMEOUT,
        action: (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              dismiss(toastObj.id);
              // Trigger undo through parent
              onDelete?.(post.id, post);
            }}
            className="h-7 px-3"
          >
            Undo
          </Button>
        ),
      });
      const undoId = toastObj.id;
      
      // Notify parent that post was deleted (for optimistic UI update)
      onDelete?.(post.id, post);
    } catch (error) {
      console.error('Failed to delete post:', error);
      toast({
        title: "Error",
        description: "Failed to delete post. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePin = async () => {
    try {
      await postService.pinPost(post.id, !post.isPinned);
      toast({
        title: post.isPinned ? "Post unpinned" : "Post pinned",
        description: post.isPinned 
          ? "Post removed from top of feed" 
          : "Post pinned to top of feed",
      });
      onPin?.();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update post. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-muted-foreground h-8 w-8 hover:bg-white/5 rounded-full shrink-0"
        >
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 p-1">
        <motion.div
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={menuVariants}
          className="flex flex-col gap-0.5"
        >
          {/* Author actions */}
          {canEdit && (
            <DropdownMenuItem 
              onClick={onEdit} 
              className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-white/5 focus:bg-white/5 transition-colors"
            >
              <Edit3 className="w-4 h-4 mr-2" />
              Edit post
            {remainingMinutes !== null && remainingMinutes <= 5 && (
              <span className="ml-auto text-[10px] text-yellow-500">
                {remainingMinutes}m left
              </span>
            )}
          </DropdownMenuItem>
        )}
        {!canEdit && isAuthor && (
          <DropdownMenuItem disabled className="cursor-not-allowed opacity-50 px-2 py-1.5 rounded-md">
            <Edit3 className="w-4 h-4 mr-2" />
            Edit expired
          </DropdownMenuItem>
        )}
        
        {/* Admin actions */}
        {canPin && (
          <DropdownMenuItem 
            onClick={handlePin} 
            className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-white/5 focus:bg-white/5 transition-colors"
          >
            <Pin className={cn("w-4 h-4 mr-2", post.isPinned && "fill-primary")} />
            {post.isPinned ? "Unpin post" : "Pin post"}
          </DropdownMenuItem>
        )}
        
        {/* Common actions */}
        <DropdownMenuItem 
          onClick={handleCopyLink} 
          className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-white/5 focus:bg-white/5 transition-colors"
        >
          <LinkIcon className="w-4 h-4 mr-2" />
          Copy link
        </DropdownMenuItem>
        
        <DropdownMenuItem 
          onClick={handleHide} 
          className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-white/5 focus:bg-white/5 transition-colors"
        >
          <EyeOff className="w-4 h-4 mr-2" />
          Hide post
        </DropdownMenuItem>
        
        <DropdownMenuSeparator className="my-1" />
        
        {/* Report */}
        {!isAuthor && (
          <DropdownMenuItem 
            onClick={handleReport} 
            className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-white/5 focus:bg-white/5 transition-colors text-yellow-500"
          >
            <Flag className="w-4 h-4 mr-2" />
            Report post
          </DropdownMenuItem>
        )}
        
        {/* Delete - Last and dangerous */}
        {canDelete && (
          <DropdownMenuItem 
            onClick={handleDelete} 
            className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-red-500 focus:text-red-500 hover:bg-white/5 focus:bg-white/5 transition-colors"
            disabled={isDeleting}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {isDeleting ? "Deleting..." : "Delete post"}
          </DropdownMenuItem>
        )}
        </motion.div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
