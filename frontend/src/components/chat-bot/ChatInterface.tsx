'use client';

import React, { useRef, useEffect, useState } from 'react';
import Image from 'next/image';
import PixelBubble from './PixelBubble';
import LoadingEllipsis from './LoadingEllipsis';
import { useChat } from '@ai-sdk/react';
import { isTextUIPart, DefaultChatTransport } from 'ai';

/**
 * Main chat interface component
 * 
 * AI SDK 6.0 changes:
 * - Manual input state (no longer auto-managed)
 * - Use status instead of isLoading
 * - Use sendMessage instead of handleSubmit
 * - Must use DefaultChatTransport (api option doesn't exist)
 */
export default function ChatInterface() {
  const [input, setInput] = useState('');

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    onError: (error: Error) => {
      console.error('Chat error:', error);
    },
    onFinish: () => {
      // Message completed successfully
    },
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    sendMessage({ text: input });
    setInput('');
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto bg-[#222034]">
      {/* Chat Header */}
      <div className="bg-[#1a1a2e] border-b border-gray-700 p-4">
        <h1 className="text-xl font-bold text-white">Portfolio Agent</h1>
        <p className="text-sm text-gray-400">Ask me anything about my work!</p>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-8">
            <p>Start a conversation to learn about my portfolio!</p>
          </div>
        )}
        
        {messages.map((message) => {
          // AI SDK 6.0 uses 'parts' array instead of 'content' string
          const parts = message.parts || [];
          const textParts = parts
            .filter(isTextUIPart)
            .map(part => part.text);
          const messageText = textParts.join('');
          
          return (
            <PixelBubble
              key={message.id}
              message={messageText}
              sender={message.role === 'user' ? 'you' : 'me'}
              profilePicture={message.role === 'user' ? '/pfp-you.png' : '/pfp-me.png'}
            />
          );
        })}
        
        {/* Loading indicator w/ animated ellipsis */}
        {isLoading && (
          <div className="flex items-start gap-3 flex-row mb-4">
            <div className="shrink-0">
              <Image
                src="/pfp-me.png"
                alt="Chatbot"
                width={76}
                height={76}
                className="pixel-art"
              />
            </div>
            <div className="relative max-w-[80%] md:max-w-[70%]">
              <div className="relative inline-block pixel-bubble message-bubble loading-bubble">
                <div className="text-sm text-gray-100">
                  <LoadingEllipsis />
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-3 mb-4">
            <p className="text-red-300 text-sm">
              {error.message || 'An error occurred. Please try again.'}
            </p>
            {error.message?.includes('rate limit') && (
              <p className="text-red-400 text-xs mt-1">
                Please wait a moment before sending another message.
              </p>
            )}
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="bg-[#1a1a2e] border-t border-gray-700 p-4">
        <form onSubmit={handleFormSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 px-4 py-2 bg-[#2d2d44] text-white rounded-lg border border-gray-600 focus:outline-none focus:border-blue-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
