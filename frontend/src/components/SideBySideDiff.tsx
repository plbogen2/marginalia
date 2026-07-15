import React, { useRef } from 'react';
import { diffLines } from 'diff';

interface SideBySideDiffProps {
  oldText: string;
  newText: string;
}

export const SideBySideDiff: React.FC<SideBySideDiffProps> = ({ oldText, newText }) => {
  const changes = diffLines(oldText, newText);

  const leftLines: { text: string; type: 'removed' | 'empty' | 'normal' }[] = [];
  const rightLines: { text: string; type: 'added' | 'empty' | 'normal' }[] = [];

  let i = 0;
  while (i < changes.length) {
    const change = changes[i];
    
    if (change.removed && i + 1 < changes.length && changes[i + 1].added) {
      const nextChange = changes[i + 1];
      const delLines = change.value.split('\n');
      if (delLines[delLines.length - 1] === '') delLines.pop();
      const addLines = nextChange.value.split('\n');
      if (addLines[addLines.length - 1] === '') addLines.pop();

      const maxLen = Math.max(delLines.length, addLines.length);
      for (let j = 0; j < maxLen; j++) {
        if (j < delLines.length) {
          leftLines.push({ text: delLines[j], type: 'removed' });
        } else {
          leftLines.push({ text: '', type: 'empty' });
        }

        if (j < addLines.length) {
          rightLines.push({ text: addLines[j], type: 'added' });
        } else {
          rightLines.push({ text: '', type: 'empty' });
        }
      }
      i += 2;
    } else if (change.removed) {
      const delLines = change.value.split('\n');
      if (delLines[delLines.length - 1] === '') delLines.pop();
      delLines.forEach((line) => {
        leftLines.push({ text: line, type: 'removed' });
        rightLines.push({ text: '', type: 'empty' });
      });
      i++;
    } else if (change.added) {
      const addLines = change.value.split('\n');
      if (addLines[addLines.length - 1] === '') addLines.pop();
      addLines.forEach((line) => {
        leftLines.push({ text: '', type: 'empty' });
        rightLines.push({ text: line, type: 'added' });
      });
      i++;
    } else {
      const normLines = change.value.split('\n');
      if (normLines[normLines.length - 1] === '') normLines.pop();
      normLines.forEach((line) => {
        leftLines.push({ text: line, type: 'normal' });
        rightLines.push({ text: line, type: 'normal' });
      });
      i++;
    }
  }

  const leftRef = useRef<HTMLPreElement>(null);
  const rightRef = useRef<HTMLPreElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLPreElement>) => {
    const target = e.currentTarget;
    const scrollPartner = target === leftRef.current ? rightRef.current : leftRef.current;
    if (scrollPartner && scrollPartner.scrollTop !== target.scrollTop) {
      scrollPartner.scrollTop = target.scrollTop;
    }
  };

  return (
    <div className="sbs-diff-container">
      <div className="sbs-diff-pane left-pane">
        <div className="pane-header">Original</div>
        <pre className="pane-content" ref={leftRef} onScroll={handleScroll}>
          {leftLines.map((line, idx) => (
            <div key={idx} className={`diff-line-row diff-${line.type}`}>
              <span className="line-number">{line.type !== 'empty' ? idx + 1 : ''}</span>
              <span className="line-text">{line.text || ' '}</span>
            </div>
          ))}
        </pre>
      </div>
      <div className="sbs-diff-pane right-pane">
        <div className="pane-header">Modified</div>
        <pre className="pane-content" ref={rightRef} onScroll={handleScroll}>
          {rightLines.map((line, idx) => (
            <div key={idx} className={`diff-line-row diff-${line.type}`}>
              <span className="line-number">{line.type !== 'empty' ? idx + 1 : ''}</span>
              <span className="line-text">{line.text || ' '}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
};
