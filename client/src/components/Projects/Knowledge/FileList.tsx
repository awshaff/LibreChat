import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { EModelEndpoint, EToolResources, QueryKeys } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import DropzoneContent, { dropzoneClassName } from '~/components/SidePanel/Agents/UploadDropzone';
import { useFileHandlingNoChatContext, useProjectKnowledgeDrop } from '~/hooks/Files';
import FileRow, { FileRowWrapper } from '~/components/Chat/Input/Files/FileRow';
import { useProjectKnowledgeFilesQuery } from '~/data-provider';
import { useLocalize, useLazyEffect } from '~/hooks';
import { cn } from '~/utils';

function toExtendedFile(file: TFile): ExtendedFile {
  return {
    file_id: file.file_id,
    filename: file.filename,
    filepath: file.filepath,
    type: file.type,
    size: file.bytes,
    source: file.source,
    embedded: file.embedded,
    progress: 1,
    attached: false,
  };
}

export default function FileList({ projectId }: { projectId: string }) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Map<string, ExtendedFile>>(new Map());
  const fileHandlingState = useMemo(() => ({ files, setFiles, conversation: null }), [files]);
  const { data: savedFiles } = useProjectKnowledgeFilesQuery(projectId);

  const fileEntries = useMemo<Array<[string, ExtendedFile]>>(
    () => (savedFiles ?? []).map((file) => [file.file_id, toExtendedFile(file)]),
    [savedFiles],
  );

  useLazyEffect(
    () => {
      setFiles(new Map(fileEntries));
    },
    [fileEntries],
    750,
  );

  const additionalMetadata = useMemo(
    () => ({ chatProjectId: projectId, tool_resource: EToolResources.context }),
    [projectId],
  );

  const { handleFileChange, handleFiles } = useFileHandlingNoChatContext(
    {
      additionalMetadata,
      endpointOverride: EModelEndpoint.agents,
      fileSetter: setFiles,
    },
    fileHandlingState,
  );

  const invalidateBudget = () => {
    queryClient.invalidateQueries([QueryKeys.projectKnowledgeBudget, projectId]);
  };

  const handleDroppedFiles = (droppedFiles: File[]) => {
    handleFiles(droppedFiles).finally(invalidateBudget);
  };

  const { isOver, canDrop, drop } = useProjectKnowledgeDrop(handleDroppedFiles);

  const handleLocalFileClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fileInputRef.current?.click();
  };

  const onFileInputChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    handleFileChange(event);
    invalidateBudget();
  };

  return (
    <div ref={drop} className="flex flex-col gap-3">
      <FileRow
        files={files}
        setFiles={setFiles}
        chatProjectId={projectId}
        tool_resource={EToolResources.context}
        Wrapper={FileRowWrapper}
      />
      <button
        type="button"
        className={cn(
          dropzoneClassName,
          isOver && canDrop && 'border-border-heavy bg-surface-hover text-text-primary',
        )}
        onClick={handleLocalFileClick}
      >
        <DropzoneContent
          label={localize('com_ui_project_knowledge_upload')}
          hint={localize('com_ui_project_knowledge_upload_hint')}
        />
      </button>
      <input
        multiple={true}
        type="file"
        style={{ display: 'none' }}
        tabIndex={-1}
        ref={fileInputRef}
        onChange={onFileInputChange}
      />
    </div>
  );
}
