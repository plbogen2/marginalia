export function resolveRelativePath(currentFile: string, relativeLink: string): string {
  const decodedLink = decodeURIComponent(relativeLink);
  if (decodedLink.startsWith('/')) {
    return decodedLink.slice(1);
  }

  const parts = currentFile.split('/');
  parts.pop();

  const linkParts = decodedLink.split('/');
  for (const part of linkParts) {
    if (part === '.' || part === '') {
      continue;
    } else if (part === '..') {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return parts.join('/');
}
