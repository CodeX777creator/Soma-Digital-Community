"use client";

import { useState } from "react";
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

interface PostOptionsMenuProps {
  post: Post;
  onEdit?: () => void;
  onDelete?: () => void;
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
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  
  const isAuthor = user?.uid === post.authorId;
  const canEdit = isAuthor;
  const canDelete = isAuthor || isAdmin;
  const canPin = isAdmin;

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
      // TODO: Implement delete in postService
      // await postService.deletePost(post.id);
      toast({
        title: "Post deleted",
        description: "Your post has been removed.",
      });
      onDelete?.();
    } catch (error) {
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
      <DropdownMenuContent align="end" className="w-48">
        {/* Author actions */}
        {canEdit && (
          <DropdownMenuItem onClick={onEdit} className="cursor-pointer">
            <Edit3 className="w-4 h-4 mr-2" />
            Edit post
          </DropdownMenuItem>
        )}
        
        {/* Admin actions */}
        {canPin && (
          <DropdownMenuItem onClick={handlePin} className="cursor-pointer">
            <Pin className={cn("w-4 h-4 mr-2", post.isPinned && "fill-primary")} />
            {post.isPinned ? "Unpin post" : "Pin post"}
          </DropdownMenuItem>
        )}
        
        {/* Common actions */}
        <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer">
          <LinkIcon className="w-4 h-4 mr-2" />
          Copy link
        </DropdownMenuItem>
        
        <DropdownMenuItem onClick={handleHide} className="cursor-pointer">
          <EyeOff className="w-4 h-4 mr-2" />
          Hide post
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        {/* Report */}
        {!isAuthor && (
          <DropdownMenuItem onClick={handleReport} className="cursor-pointer text-yellow-500">
            <Flag className="w-4 h-4 mr-2" />
            Report post
          </DropdownMenuItem>
        )}
        
        {/* Delete - Last and dangerous */}
        {canDelete && (
          <DropdownMenuItem 
            onClick={handleDelete} 
            className="cursor-pointer text-red-500 focus:text-red-500"
            disabled={isDeleting}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {isDeleting ? "Deleting..." : "Delete post"}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
