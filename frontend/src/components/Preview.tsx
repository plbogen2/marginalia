import React, { useEffect, useState } from 'react';
import { marked } from 'marked';

interface PreviewProps {
  markdown: string;
  onNavigateLink?: (href: string) => void;
}

export const Preview: React.FC<PreviewProps> = ({ markdown, onNavigateLink }) => {
  const [html, setHtml] = useState('');

  useEffect(() => {
    const render = async () => {
      const parsed = await marked.parse(markdown);
      setHtml(parsed);
    };
    render();
  }, [markdown]);

  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    
    if (anchor) {
      const href = anchor.getAttribute('href');
      if (href) {
        const isExternal = href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//') || href.startsWith('#') || href.startsWith('mailto:');
        if (!isExternal) {
          e.preventDefault();
          onNavigateLink?.(href);
        }
      }
    }
  };

  return (
    <div className="preview-container">
      <div
        className="preview-content markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={handleContentClick}
      />
    </div>
  );
};
