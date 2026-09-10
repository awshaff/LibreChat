import { useMemo, useRef, useState } from 'react';
import {
  EModelEndpoint,
  EToolResources,
  mergeFileConfig,
  getEndpointFileConfig,
} from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import type { DragEvent } from 'react';
import type { ExtendedFile } from '~/common';
import DropzoneContent, { dropzoneClassName } from '~/components/SidePanel/Agents/UploadDropzone';
import FileRow, { FileRowWrapper } from '~/components/Chat/Input/Files/FileRow';
import { useFileHandlingNoChatContext } from '~/hooks/Files/useFileHandling';
import { useProjectFilesQuery, useGetFileConfig } from '~/data-provider';
import { useLocalize, useLazyEffect } from '~/hooks';
import { cn } from '~/utils';

const toExtendedFile = (file: TFile): ExtendedFile => ({
  file_id: file.file_id,
  type: file.type,
  filepath: file.filepath,
  filename: file.filename,
  width: file.width,
  height: file.height,
  size: file.bytes ?? 0,
  progress: 1,
  source: file.source,
  embedded: file.embedded,
  metadata: file.metadata,
});

export default function ProjectKnowledge({ projectId }: { projectId: string }) {
  const localize = useLocalize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Map<string, ExtendedFile>>(new Map());
  const fileHandlingState = useMemo(() => ({ files, setFiles, conversation: null }), [files]);
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounterRef = useRef(0);

  const { data: projectFiles } = useProjectFilesQuery(projectId);
  const { data: fileConfig = null } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });
  const endpointFileConfig = getEndpointFileConfig({
    fileConfig,
    endpointType: EModelEndpoint.agents,
    endpoint: EModelEndpoint.agents,
  });

  useLazyEffect(
    () => {
      if (projectFiles) {
        setFiles(new Map(projectFiles.map((file) => [file.file_id, toExtendedFile(file)])));
      }
    },
    [projectFiles],
    750,
  );

  const { handleFileChange, handleFiles } = useFileHandlingNoChatContext(
    {
      additionalMetadata: { project_id: projectId, tool_resource: EToolResources.context },
      endpointOverride: EModelEndpoint.agents,
      endpointTypeOverride: EModelEndpoint.agents,
      fileSetter: setFiles,
    },
    fileHandlingState,
  );

  const isUploadDisabled = endpointFileConfig?.disabled ?? false;

  const handleLocalFileClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fileInputRef.current?.click();
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isUploadDisabled) {
      return;
    }
    dragCounterRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragActive(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragActive(false);
    if (isUploadDisabled) {
      return;
    }
    const droppedFiles = event.dataTransfer.files;
    if (droppedFiles.length > 0) {
      handleFiles(droppedFiles);
    }
  };

  return (
    <section className="mt-8">
      <h2 className="mb-1 text-sm font-medium text-text-primary">
        {localize('com_ui_project_knowledge')}
      </h2>
      <p className="mb-3 text-sm text-text-secondary">
        {localize('com_ui_project_knowledge_info')}
      </p>
      <div className="flex flex-col gap-3">
        <FileRow
          files={files}
          setFiles={setFiles}
          project_id={projectId}
          tool_resource={EToolResources.context}
          Wrapper={FileRowWrapper}
        />
        {isUploadDisabled ? null : (
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <button
              type="button"
              className={cn(
                dropzoneClassName,
                isDragActive && 'border-border-heavy bg-surface-hover',
              )}
              onClick={handleLocalFileClick}
            >
              <DropzoneContent
                label={localize('com_ui_upload_file_context')}
                hint={localize('com_ui_upload_files_hint')}
              />
            </button>
            <input
              multiple={true}
              type="file"
              style={{ display: 'none' }}
              tabIndex={-1}
              ref={fileInputRef}
              onChange={handleFileChange}
            />
          </div>
        )}
      </div>
    </section>
  );
}
