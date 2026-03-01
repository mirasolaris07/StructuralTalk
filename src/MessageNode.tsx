import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  CheckCircle,
  Search,
  BrainCircuit,
  FileText,
  Play,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { ChatMessage, AgentThought } from './ChatInterface';
import './MessageNode.css';

interface MessageNodeProps {
  message: ChatMessage;
  isLive?: boolean;
}

export const MessageNode: React.FC<MessageNodeProps> = ({ message, isLive }) => {
  if (message.role === 'user') {
    return <div className="user-message-text">{message.content}</div>;
  }

  return (
    <div className="agent-message-container">
      {message.thoughts && message.thoughts.length > 0 && (
        <div className="thought-process-container">
          <div className="thought-header">
            <BrainCircuit size={16} />
            <span>Agent Thought Process</span>
            {isLive && (
              <span className="live-badge">
                <Loader2 size={12} className="spinning" />
                Thinking...
              </span>
            )}
          </div>
          <div className="thought-tree">
            {message.thoughts.map((thought) => (
              <ThoughtNode key={thought.id} thought={thought} defaultExpanded={isLive} isLive={isLive} />
            ))}
          </div>
        </div>
      )}
      {message.content && (
        <div className="final-response">
          {message.content.split('\n').map((line, i) => (
            <React.Fragment key={i}>
              {line}
              {i < message.content.split('\n').length - 1 && <br />}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

const ThoughtNode: React.FC<{ thought: AgentThought; defaultExpanded?: boolean; isLive?: boolean }> = ({
  thought,
  defaultExpanded = false,
  isLive = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const hasChildren = thought.children && thought.children.length > 0;

  const getIcon = () => {
    // Only spin if this thought panel is still live (streaming in progress)
    if (isLive && thought.status === 'running') return <Loader2 size={14} className="spinning icon-running" />;
    if (thought.status === 'error') return <AlertCircle size={14} className="icon-error" />;
    // Once finalized, always show the static type icon
    switch (thought.type) {
      case 'search':
        return <Search size={14} className="icon-search" />;
      case 'reasoning':
        return <BrainCircuit size={14} className="icon-reasoning" />;
      case 'summary':
        return <FileText size={14} className="icon-summary" />;
      case 'action':
        return <Play size={14} className="icon-action" />;
      default:
        return <CheckCircle size={14} />;
    }
  };

  const getStatusIcon = () => {
    if (thought.status === 'error') return <AlertCircle size={12} className="status-icon status-error" />;
    // Always show a checkmark on finalized messages, even if status was 'running'
    if (!isLive || thought.status === 'completed') return <CheckCircle size={12} className="status-icon status-completed" />;
    // Only show spinner on live in-progress thoughts
    if (thought.status === 'running') return <Loader2 size={12} className="spinning status-icon status-running" />;
    return null;
  };

  return (
    <div className={`thought-node depth-${thought.depth}`}>
      <div
        className={`thought-node-header ${hasChildren ? 'clickable' : ''} status-${thought.status}`}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        <div className="expand-icon">
          {hasChildren ? (
            expanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : (
            <span style={{ width: 14 }} />
          )}
        </div>
        <div className="thought-icon">{getIcon()}</div>
        <span className="depth-badge" title={`Recursion depth ${thought.depth}`}>L{thought.depth}</span>
        <span className="thought-title">{thought.title}</span>
        {getStatusIcon()}
      </div>

      {expanded && (
        <div className="thought-node-content animate-fade-in">
          <div className="thought-text text-mono">{thought.content}</div>
          {hasChildren && (
            <div className="thought-children">
              {thought.children!.map((child) => (
                <ThoughtNode key={child.id} thought={child} defaultExpanded={defaultExpanded} isLive={isLive} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
