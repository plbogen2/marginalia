export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

export const buildFileTree = (paths: string[]): FileNode[] => {
  const root: FileNode[] = [];

  paths.forEach((fullPath) => {
    const parts = fullPath.split('/');
    let currentLevel = root;
    let accumulatedPath = '';

    parts.forEach((part, index) => {
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
      const isLast = index === parts.length - 1;

      let existingNode = currentLevel.find((node) => node.name === part);

      if (!existingNode) {
        existingNode = {
          name: part,
          path: accumulatedPath,
          isDirectory: !isLast
        };
        if (!isLast) {
          existingNode.children = [];
        }
        currentLevel.push(existingNode);
      }

      if (!isLast) {
        currentLevel = existingNode.children!;
      }
    });
  });

  const sortNodes = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => {
      if (node.children) {
        sortNodes(node.children);
      }
    });
  };

  sortNodes(root);
  return root;
};
