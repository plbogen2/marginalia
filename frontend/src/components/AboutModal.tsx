import React from 'react';
import { X, Info, ExternalLink, ShieldCheck, Sparkles, GitBranch, Heart } from 'lucide-react';

interface AboutModalProps {
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content about-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <Info size={18} /> About Marginalia
          </h2>
          <button className="close-btn" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body about-body">
          <div className="about-hero">
            <h1 className="about-title">Marginalia</h1>
            <span className="version-tag">v1.2.0</span>
            <p className="about-description">
              A focused, web-based Markdown editor designed for fiction writing with integrated Git version control and AI editing assistance.
            </p>
          </div>

          <div className="about-section">
            <h3><Sparkles size={14} /> Release Notes & Highlights</h3>
            <div className="release-notes-list">
              <div className="release-card">
                <div className="release-header">
                  <span className="release-version">v1.2.0 (Latest)</span>
                  <span className="release-date">July 2026</span>
                </div>
                <ul>
                  <li><strong>In-Memory AES-256-GCM Vault:</strong> Zero-plaintext server storage using in-memory virtual filesystems.</li>
                  <li><strong>Per-User Encrypted Sandbox:</strong> Auto-mount VFS on login and auto-unmount on logout/idle.</li>
                  <li><strong>Git Sparse-Checkout & Blob Filter:</strong> Excludes binary executables (<code>.exe</code>, <code>.sh</code>, <code>.dll</code>, <code>.bin</code>) and limits blob downloads to 10MB.</li>
                  <li><strong>Per-User Storage Quota:</strong> Enforces 100MB per-user quota with live storage progress bars.</li>
                </ul>
              </div>

              <div className="release-card">
                <div className="release-header">
                  <span className="release-version">v1.1.0</span>
                  <span className="release-date">July 2026</span>
                </div>
                <ul>
                  <li><strong>GitHub OAuth Repos Browser:</strong> Browse, filter, and clone public/private repos directly into user VFS storage.</li>
                  <li><strong>Markdown Linter Integration:</strong> Integrated backend <code>markdownlint</code> with formatting and hover squiggles.</li>
                  <li><strong>Paragraph-Level Caching:</strong> MD5-hashed caching for LanguageTool spelling and grammar checks.</li>
                </ul>
              </div>

              <div className="release-card">
                <div className="release-header">
                  <span className="release-version">v1.0.0</span>
                  <span className="release-date">July 2026</span>
                </div>
                <ul>
                  <li><strong>Focus-Oriented Editor:</strong> Dual-pane Markdown editor with real-time preview and collapsible sidebars.</li>
                  <li><strong>Side-by-Side Diffs:</strong> Visual commit diffs and automated AI commit message suggestions.</li>
                  <li><strong>AI Editing Personas:</strong> Developmental, Line, Copy, Proofreader, and Security Auditor personas.</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="about-section copyright-section">
            <h3><ShieldCheck size={14} /> Copyright & Open Source License</h3>
            <p>
              Marginalia is open-source software released under the <strong>MIT License</strong>.
            </p>
            <p className="copyright-text">
              Copyright &copy; 2026 Paul Bogen (<code>plbogen2/marginalia</code>). All rights reserved.
            </p>
            <div className="about-links">
              <a 
                href="https://github.com/plbogen2/marginalia" 
                target="_blank" 
                rel="noopener noreferrer"
                className="about-link"
              >
                <GitBranch size={13} /> GitHub Repository <ExternalLink size={11} />
              </a>
              <a 
                href="http://64-181-248-211.nip.io" 
                target="_blank" 
                rel="noopener noreferrer"
                className="about-link"
              >
                <Heart size={13} /> Live Instance <ExternalLink size={11} />
              </a>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="secondary-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
