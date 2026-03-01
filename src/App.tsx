import React from 'react';
import { ChatInterface } from './ChatInterface';
import './App.css';

function App() {
  return (
    <div className="app-container">
      <header className="app-header glass-panel">
        <div className="logo-container">
          <div className="logo-icon animate-spin-slow"></div>
          <h1>StructuralTalk</h1>
        </div>
        <div className="header-status">
          <span className="status-dot"></span>
          <span className="status-text">Agent Online</span>
        </div>
      </header>

      <main className="app-main">
        <ChatInterface />
      </main>
    </div>
  );
}

export default App;
