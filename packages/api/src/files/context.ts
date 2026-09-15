import { logger } from '@librechat/data-schemas';
import { FileSources, mergeFileConfig } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { TFile } from 'librechat-data-provider';
import type { TokenCountFn } from '~/utils/text';
import type { ServerRequest } from '~/types';
import { processTextWithTokenLimit } from '~/utils/text';

/**
 * Stand-in text for a user turn that carries attachments but no typed message.
 * Anthropic and the Assistants API both reject empty user content, and files
 * that reach the model out-of-band (RAG, code environment) leave nothing else
 * in the turn, so the payload needs this minimal note. The stored message keeps
 * its empty text so the UI still renders the attachment on its own.
 */
export const ATTACHMENT_ONLY_TEXT = 'Please refer to the attached file(s).';

/**
 * Title-generation input for a turn the user sent without typing anything.
 * Immediate title timing runs before any response exists, so the attachment
 * filenames are the only conversation-specific signal available; without them
 * the title model is prompted with an empty string and invents a topic.
 */
export function getAttachmentTitleText(files?: TFile[] | null): string {
  if (!files?.length) {
    return '';
  }

  const filenames = files.map((file) => file.filename).filter(Boolean);
  return filenames.length > 0 ? `Attached file(s): ${filenames.join(', ')}` : '';
}

export type FileContextResult = {
  text: string | undefined;
  wasTruncated: boolean;
};

/**
 * Extracts text context from attachments and returns formatted text.
 * This handles text that was already extracted from files (OCR, transcriptions, document text, etc.)
 * @param params - The parameters object
 * @param params.attachments - Array of file attachments
 * @param params.req - Express request object for config access
 * @param params.tokenCountFn - Function to count tokens in text
 * @param params.fileTokenLimit - Optional explicit per-file token limit override,
 *   taking precedence over `req.body.fileTokenLimit`/the configured default. Callers
 *   that already resolved a caller-specific budget (e.g. a per-project split) pass
 *   this instead of relying on the request body.
 * @returns The formatted file context text (or undefined if no text found), and
 *   whether any file's text was truncated to fit the token limit.
 */
export async function extractFileContext({
  attachments,
  req,
  tokenCountFn,
  fileTokenLimit: fileTokenLimitOverride,
}: {
  attachments: IMongoFile[];
  req?: ServerRequest;
  tokenCountFn: TokenCountFn;
  fileTokenLimit?: number;
}): Promise<FileContextResult> {
  if (!attachments || attachments.length === 0) {
    return { text: undefined, wasTruncated: false };
  }

  const fileConfig = mergeFileConfig(req?.config?.fileConfig);
  const fileTokenLimit =
    fileTokenLimitOverride ?? req?.body?.fileTokenLimit ?? fileConfig.fileTokenLimit;

  if (!fileTokenLimit) {
    // If no token limit, return undefined (no processing)
    return { text: undefined, wasTruncated: false };
  }

  let resultText = '';
  let wasTruncated = false;

  for (const file of attachments) {
    const source = file.source ?? FileSources.local;
    if (source === FileSources.text && file.text) {
      const { text: limitedText, wasTruncated: fileWasTruncated } = await processTextWithTokenLimit(
        {
          text: file.text,
          tokenLimit: fileTokenLimit,
          tokenCountFn,
        },
      );

      if (fileWasTruncated) {
        wasTruncated = true;
        logger.debug(
          `[extractFileContext] Text content truncated for file: ${file.filename} due to token limits`,
        );
      }

      resultText += `${!resultText ? 'Attached document(s):\n```md' : '\n\n---\n\n'}# "${file.filename}"\n${limitedText}\n`;
    }
  }

  if (resultText) {
    resultText += '\n```';
    return { text: resultText, wasTruncated };
  }

  return { text: undefined, wasTruncated: false };
}
