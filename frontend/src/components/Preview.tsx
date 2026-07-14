import React, { useEffect, useState } from 'react';
import { marked } from 'marked';

interface PreviewProps {
  markdown: string;
}

export const Preview: React.FC<PreviewProps> = ({ markdown }) => {
  const [html, setHtml] = useState('');

  useEffect(() => {
    const render = async () => {
      const parsed = await marked.parse(markdown);
      setHtml(parsed);
    };
    render();
  }, [markdown]);

  return (
    <div className="preview-container">
      <div className="preview-header">
        <span>Preview</span>
      </div>
      <div
        className="preview-content markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};
