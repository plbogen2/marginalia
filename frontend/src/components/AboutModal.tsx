import React, { useState, useEffect } from 'react';
import { X, Info, ExternalLink, ShieldCheck, Sparkles, GitBranch, Heart, Lock, Mic, Smartphone } from 'lucide-react';
import { marked } from 'marked';

interface AboutModalProps {
  onClose: () => void;
}

interface ReleaseNote {
  version: string;
  date: string;
  bodyHtml: string;
}

export const AboutModal: React.FC<AboutModalProps> = ({ onClose }) => {
  const [releaseNotes, setReleaseNotes] = useState<ReleaseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    const fetchChangelog = async () => {
      try {
        const res = await fetch('/api/changelog');
        if (!res.ok) throw new Error('Failed to fetch changelog');
        const data = await res.json();
        if (data.content) {
          const sections = data.content.split('## ').slice(1);
          const parsedNotes: ReleaseNote[] = sections.map((section: string) => {
            const lines = section.split('\n');
            const headerLine = lines[0].trim();
            const match = headerLine.match(/^(v[0-9.]+)\s+\(([^)]+)\)/);
            let version = headerLine;
            let date = '';
            if (match) {
              version = match[1];
              date = match[2];
            }
            const body = lines.slice(1).join('\n');
            const parsedBody = marked.parse(body) as string;
            // Inject check-icon SVG into li elements to match existing design
            const bodyHtml = parsedBody.replace(
              /<li>/g, 
              '<li><svg class="check-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>'
            );
            return { version, date, bodyHtml };
          });
          setReleaseNotes(parsedNotes);
        }
      } catch (err) {
        console.error('Failed to load changelog:', err);
      } finally {
        setLoading(false);
      }
    };

    const fetchVersion = async () => {
      try {
        const res = await fetch('/api/version');
        if (res.ok) {
          const data = await res.json();
          if (data.version) {
            setVersion(`v${data.version}`);
          }
        }
      } catch (err) {
        console.error('Failed to fetch version:', err);
      }
    };

    fetchChangelog();
    fetchVersion();
  }, []);

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
            <div className="title-row">
              <h1 className="about-title">Marginalia</h1>
              <span className="version-tag">{version || '...'}</span>
            </div>
            <p className="about-description">
              A distraction-free, web-based Markdown workstation for authors and fiction writers, featuring integrated Git version control, zero-plaintext encrypted VFS storage, AI dictation & audio proofreading, and AI editing assistance.
            </p>
            <div className="feature-badges">
              <span className="badge"><Mic size={12} /> Voice & Audio TTS</span>
              <span className="badge"><Lock size={12} /> Encrypted VFS Vault</span>
              <span className="badge"><GitBranch size={12} /> Git Native</span>
              <span className="badge"><Smartphone size={12} /> Standalone PWA</span>
            </div>
          </div>

          <div className="about-section">
            <h3><Sparkles size={15} /> Release Notes & Changelog</h3>
            <div className="release-notes-list">
              {loading ? (
                <div className="changelog-loading">Loading release notes...</div>
              ) : (
                releaseNotes.map((note, index) => (
                  <div key={note.version} className={`release-card ${index === 0 ? 'latest' : ''}`}>
                    <div className="release-header">
                      <div className="version-info">
                        <span className="release-version">{note.version}</span>
                        {index === 0 && <span className="current-badge">Latest Release</span>}
                      </div>
                      <span className="release-date">{note.date}</span>
                    </div>
                    <div dangerouslySetInnerHTML={{ __html: note.bodyHtml }} />
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="about-section copyright-section">
            <h3><ShieldCheck size={15} /> Copyright & Open Source License</h3>
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
