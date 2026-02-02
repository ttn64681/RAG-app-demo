import React from 'react';
import Image from 'next/image';

interface PixelBubbleProps {
  message: string | React.ReactNode;
  sender: 'me' | 'you';
  profilePicture: string;
}

/**
 * PixelBubble component using 9-slice scaling for dynamic message sizing
 * 
 * Layout:
 * - "me" (chatbot):
 * - "you" (user):
 * 
 * sizing_info.txt:
 * - Base bubble: 48x40px
 * - Corners: 12x16px (fixed)
 * - Left/Right edges: 12x16px
 * - Top/Bottom edges: 16x16px
 * - Center: stretch x and y-wise
 */
export default function PixelBubble({ message, sender, profilePicture }: PixelBubbleProps) {
  const isMe = sender === 'me';
  const bubbleClass = isMe ? 'message-bubble-me' : 'message-bubble-you';
  
  return (
    <div className={`flex items-start gap-3 ${isMe ? 'flex-row' : 'flex-row-reverse'} mb-4`}>
      {/* Profile Picture - LEFT for "me" (chatbot), RIGHT for "you" (user) */}
      <div className="shrink-0">
        <Image
          src={profilePicture}
          alt={isMe ? 'Chatbot' : 'You'}
          width={76}
          height={76}
          className="pixel-art"
        />
      </div>

      {/* Message Bubble with 9-slice scaling */}
      <div className="relative max-w-[80%] md:max-w-[70%]">
        <div className={`relative inline-block pixel-bubble message-bubble ${bubbleClass}`}>
          <div className="text-sm text-gray-100 whitespace-pre-wrap break-word leading-relaxed">
            {message}
          </div>
        </div>
      </div>
    </div>
  );
}
