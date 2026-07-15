import React from 'react';
import { X } from 'lucide-react';

interface MarkdownGuideModalProps {
  onClose: () => void;
}

export const MarkdownGuideModal: React.FC<MarkdownGuideModalProps> = ({ onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content markdown-guide-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Markdown Syntax Guide</h3>
          <button className="close-btn" onClick={onClose} title="Close (Esc)">
            <X size={16} />
          </button>
        </div>
        
        <div className="modal-body">
          <div className="guide-grid">
            <div className="guide-section">
              <h4>Headers</h4>
              <pre>
{`# Heading 1
## Heading 2
### Heading 3`}
              </pre>
            </div>

            <div className="guide-section">
              <h4>Emphasis</h4>
              <pre>
{`*italic* or _italic_
**bold** or __bold__
~~strikethrough~~`}
              </pre>
            </div>

            <div className="guide-section">
              <h4>Lists</h4>
              <pre>
{`- Unordered Item 1
- Unordered Item 2

1. Ordered Item 1
2. Ordered Item 2`}
              </pre>
            </div>

            <div className="guide-section">
              <h4>Links & Images</h4>
              <pre>
{`[Link Text](https://example.com)
![Image Alt Text](path/to/image.png)`}
              </pre>
            </div>

            <div className="guide-section">
              <h4>Quotes & Code</h4>
              <pre>
{`> Blockquote paragraph.

\`inline code\`

\`\`\`javascript
// Block code
console.log("hello");
\`\`\``}
              </pre>
            </div>

            <div className="guide-section">
              <h4>Keyboard Shortcuts</h4>
              <table className="shortcuts-table">
                <tbody>
                  <tr>
                    <td><kbd>Ctrl</kbd> + <kbd>S</kbd> / <kbd>Cmd</kbd> + <kbd>S</kbd></td>
                    <td>Save active file changes</td>
                  </tr>
                  <tr>
                    <td><kbd>F1</kbd></td>
                    <td>Toggle Markdown Syntax Guide</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
