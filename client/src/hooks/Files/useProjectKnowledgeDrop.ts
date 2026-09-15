import { useCallback } from 'react';
import { useDrop } from 'react-dnd';
import { NativeTypes } from 'react-dnd-html5-backend';
import type { DropTargetMonitor } from 'react-dnd';

/**
 * Minimal drag-and-drop target for the Project Knowledge panel. `useDragHelpers`
 * (the composer's dropzone) is chat-context-coupled — it reads the active
 * conversation and routes through the upload-option modal — so it can't be
 * reused outside the chat pane. This mirrors only its `react-dnd` primitives.
 */
export default function useProjectKnowledgeDrop(onDropFiles: (files: File[]) => void) {
  const handleDrop = useCallback(
    (item: { files: File[] }) => {
      onDropFiles(item.files);
    },
    [onDropFiles],
  );

  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: [NativeTypes.FILE],
      drop: handleDrop,
      canDrop: () => true,
      collect: (monitor: DropTargetMonitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [handleDrop],
  );

  return { isOver, canDrop, drop };
}
