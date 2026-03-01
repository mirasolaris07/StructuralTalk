/**
 * ChatInterface.tsx
 * ─────────────────
 * The main chat UI component. Uses StructuralTalkClient (from the
 * structuraltalk-agent module) to communicate with the backend agent,
 * showing live thought steps as they stream in.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Upload, Command } from 'lucide-react';
import { MessageNode } from './MessageNode';
import { StructuralTalkClient } from '../structuraltalk-agent/client.js';
import './ChatInterface.css';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  thoughts?: AgentThought[];
}

export interface AgentThought {
  id: string;
  type: 'reasoning' | 'search' | 'summary' | 'action';
  title: string;
  content: string;
  depth: number;
  status: 'pending' | 'running' | 'completed' | 'error';
  children?: AgentThought[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const API_URL = 'http://localhost:3001';

// ── Component ─────────────────────────────────────────────────────────────────

export const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [liveThoughts, setLiveThoughts] = useState<AgentThought[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Create a single StructuralTalkClient instance for this component.
  // useMemo ensures it is only created once (not recreated on every render).
  const client = useMemo(() => new StructuralTalkClient(API_URL), []);

  // Auto-scroll to bottom whenever messages or live thoughts update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, liveThoughts]);

  const handleSend = async () => {
    if (!inputValue.trim() || isTyping) return;

    const userMessage = inputValue.trim();

    // Append the user's message to the chat immediately
    const newUserMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newUserMsg]);
    setInputValue('');
    setIsTyping(true);
    setLiveThoughts([]);        // Clear previous live thought stream

    // Build history from existing messages (exclude the one just added)
    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    // Collect thoughts during streaming so we can attach them to the final message
    const collectedThoughts: AgentThought[] = [];

    // Use StructuralTalkClient to send the message and handle SSE events
    await client.send({
      message: userMessage,
      history,

      // Called live for every thought step — updates the "thinking" display
      onThought: (thought) => {
        collectedThoughts.push(thought as AgentThought);
        setLiveThoughts([...collectedThoughts]);
      },

      // Called once with the agent's complete final answer
      onResponse: (answer) => {
        const agentMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: answer,
          timestamp: new Date(),
          thoughts: collectedThoughts,  // Attach all thoughts to the message
        };
        setMessages((prev) => [...prev, agentMsg]);
      },

      // Called if the server or network returns an error
      onError: (errorMsg) => {
        const errMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: `⚠️ Could not reach the server. Make sure the backend is running on ${API_URL}.\n\nError: ${errorMsg}`,
          timestamp: new Date(),
          thoughts: [{
            id: `t-err-${Date.now()}`,
            type: 'reasoning',
            title: 'Connection failed',
            content: `Failed to connect to ${API_URL}/api/chat`,
            depth: 0,
            status: 'error',
          }],
        };
        setMessages((prev) => [...prev, errMsg]);
      },

      // Called when the stream finishes (success or failure)
      onDone: () => {
        setIsTyping(false);
        setLiveThoughts([]);
      },
    });
  };

  return (
    <div className="chat-container">
      <div className="chat-history" ref={scrollRef}>

        {/* Empty state — shown when no messages yet */}
        {messages.length === 0 && !isTyping && (
          <div className="empty-state">
            <div className="empty-icon">
              <Command size={48} />
            </div>
            <h2>StructuralTalk</h2>
            <p>Ask me anything. I'll search the web, analyze results recursively,<br />and show you my thought process.</p>
          </div>
        )}

        {/* Conversation history */}
        {messages.map((message) => (
          <div key={message.id} className={`message-wrapper ${message.role}`}>
            {message.role === 'agent' && (
              <div className="agent-avatar"><Command size={16} /></div>
            )}
            <div className="message-content-box">
              <MessageNode message={message} />
            </div>
            {message.role === 'user' && (
              <div className="user-avatar">U</div>
            )}
          </div>
        ))}

        {/* Live thought stream — shown while the agent is thinking */}
        {isTyping && (
          <div className="message-wrapper agent">
            <div className="agent-avatar"><Command size={16} /></div>
            <div className="message-content-box">
              {liveThoughts.length > 0 ? (
                <MessageNode
                  message={{
                    id: 'live',
                    role: 'agent',
                    content: '',           // No final text yet
                    timestamp: new Date(),
                    thoughts: liveThoughts,
                  }}
                  isLive
                />
              ) : (
                // Show dots until the first thought arrives
                <div className="typing-indicator glass-panel">
                  <span className="dot"></span>
                  <span className="dot"></span>
                  <span className="dot"></span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="chat-input-area glass-panel">
        <button className="icon-btn" title="Upload Attachment">
          <Upload size={20} />
        </button>
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ask anything..."
          className="chat-input"
          rows={1}
          disabled={isTyping}
        />
        <button
          className="icon-btn submit-btn"
          onClick={handleSend}
          disabled={!inputValue.trim() || isTyping}
        >
          <Send size={20} />
        </button>
      </div>
    </div>
  );
};
