import { Constants, EToolResources } from 'librechat-data-provider';
import { DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import type { Agent, AgentToolResources, TEphemeralAgent } from 'librechat-data-provider';
import type { IChatProject } from '@librechat/data-schemas';
import type { LCTool } from '@librechat/agents';
import type { Logger } from 'winston';
import type { ParsedServerConfig } from '~/mcp/types';
import type { MCPManager } from '~/mcp/MCPManager';

/** Resolved knowledge from the Project a conversation is scoped to, already
 *  fetched by the caller — this module stays DB-free. */
export type ProjectContext = {
  /** Short instructions text (e.g. project name/description) merged into the agent's instructions. */
  instructions?: string;
  /** `tool_resources.context.file_ids` from the project's knowledge, merged into the agent's own. */
  contextFileIds?: string[];
};

/**
 * Agent type with optional tools array that can contain DynamicStructuredTool or string.
 * For context operations, we only require id and instructions, other Agent fields are optional.
 */
export type AgentWithTools = Pick<Agent, 'id'> &
  Partial<Omit<Agent, 'id' | 'tools'>> & {
    tools?: Array<DynamicStructuredTool | string>;
    /** Serializable tool definitions for event-driven mode */
    toolDefinitions?: LCTool[];
  };

/**
 * Extracts unique MCP server names from an agent's tools or tool definitions.
 * Supports both full tool instances (tools) and serializable definitions (toolDefinitions).
 * @param agent - The agent with tools and/or tool definitions
 * @returns Array of unique MCP server names
 */
export function extractMCPServers(agent: AgentWithTools): string[] {
  const mcpServers = new Set<string>();

  /** Check tool instances (non-event-driven mode) */
  if (agent?.tools?.length) {
    for (const tool of agent.tools) {
      if (tool instanceof DynamicStructuredTool && tool.name.includes(Constants.mcp_delimiter)) {
        const carried = (tool as { mcpRawServerName?: string }).mcpRawServerName;
        const serverName = carried ?? tool.name.split(Constants.mcp_delimiter).pop();
        if (serverName) {
          mcpServers.add(serverName);
        }
      }
    }
  }

  /** Check tool definitions (event-driven mode) */
  if (agent?.toolDefinitions?.length) {
    for (const toolDef of agent.toolDefinitions) {
      if (toolDef.name?.includes(Constants.mcp_delimiter)) {
        const serverName = toolDef.serverName ?? toolDef.name.split(Constants.mcp_delimiter).pop();
        if (serverName) {
          mcpServers.add(serverName);
        }
      }
    }
  }

  return Array.from(mcpServers);
}

/**
 * Fetches MCP instructions for the given server names.
 * @param {string[]} mcpServers - Array of MCP server names
 * @param {MCPManager} mcpManager - MCP manager instance
 * @param {Logger} [logger] - Optional logger instance
 * @returns {Promise<string>} MCP instructions string, empty if none
 */
export async function getMCPInstructionsForServers(
  mcpServers: string[],
  mcpManager: MCPManager,
  logger?: Logger,
  configServers?: Record<string, ParsedServerConfig>,
): Promise<string> {
  if (!mcpServers.length) {
    return '';
  }
  try {
    const mcpInstructions = await mcpManager.formatInstructionsForContext(
      mcpServers,
      configServers,
    );
    if (mcpInstructions && logger) {
      logger.debug('[AgentContext] Fetched MCP instructions', {
        serverCount: mcpServers.length,
      });
    }
    return mcpInstructions || '';
  } catch {
    if (logger) {
      logger.error('[AgentContext] Failed to get MCP instructions');
    }
    return '';
  }
}

/**
 * Builds stable instructions for an agent by combining agent-specific context and MCP context.
 * Order: baseInstructions -> mcpInstructions -> projectInstructions
 *
 * @param {Object} params
 * @param {string} [params.baseInstructions] - Agent's base instructions
 * @param {string} [params.mcpInstructions] - Agent's MCP server instructions
 * @param {string} [params.projectInstructions] - The conversation's Project instructions, if any
 * @returns {string | undefined} Combined instructions, or undefined if empty
 */
export function buildAgentInstructions({
  baseInstructions,
  mcpInstructions,
  projectInstructions,
}: {
  baseInstructions?: string;
  mcpInstructions?: string;
  projectInstructions?: string;
}): string | undefined {
  const parts = [baseInstructions, mcpInstructions, projectInstructions].filter(Boolean);
  const combined = parts.join('\n\n').trim();
  return combined || undefined;
}

/**
 * Turns a resolved `ChatProject` document into the plain context this module merges
 * into an agent's instructions and `tool_resources.context`. Pure transform — fetching
 * the project itself is the caller's responsibility.
 */
export function buildProjectContext(
  project?: Pick<IChatProject, 'name' | 'description' | 'tool_resources'> | null,
): ProjectContext | undefined {
  if (!project) {
    return undefined;
  }
  const instructions = [`Project: ${project.name}`, project.description].filter(Boolean).join('\n');
  const contextFileIds = project.tool_resources?.context?.file_ids;
  if (!instructions && (!contextFileIds || contextFileIds.length === 0)) {
    return undefined;
  }
  return { instructions: instructions || undefined, contextFileIds };
}

/**
 * Merges a Project's knowledge `file_ids` into the agent's own `tool_resources.context`,
 * so `primeResources` (which reads that field) picks them up without any changes of its
 * own — full-text context injection has no per-entity scoping concern, unlike file_search.
 * Mutates the agent object in place.
 */
export function mergeProjectContextFiles(agent: AgentWithTools, contextFileIds?: string[]): void {
  if (!contextFileIds || contextFileIds.length === 0) {
    return;
  }
  const toolResources = (agent.tool_resources ?? {}) as AgentToolResources;
  const existing = toolResources[EToolResources.context]?.file_ids ?? [];
  toolResources[EToolResources.context] = {
    ...toolResources[EToolResources.context],
    file_ids: Array.from(new Set([...existing, ...contextFileIds])),
  };
  agent.tool_resources = toolResources;
}

/**
 * Builds dynamic system-tail instructions for an agent.
 * Order: existing additional instructions -> shared run context.
 */
export function buildAgentAdditionalInstructions({
  additionalInstructions,
  sharedRunContext,
}: {
  additionalInstructions?: string;
  sharedRunContext?: string;
}): string | undefined {
  const parts = [additionalInstructions, sharedRunContext].filter(Boolean);
  const combined = parts.join('\n\n').trim();
  return combined || undefined;
}

/**
 * Applies run context and MCP instructions to an agent's configuration.
 * Mutates the agent object in place.
 *
 * @param {Object} params
 * @param {Agent} params.agent - The agent to update
 * @param {string} params.sharedRunContext - Run-level shared context
 * @param {MCPManager} params.mcpManager - MCP manager instance
 * @param {Object} [params.ephemeralAgent] - Ephemeral agent config (for MCP override)
 * @param {string} [params.agentId] - Agent ID for logging
 * @param {Logger} [params.logger] - Optional logger instance
 * @returns {Promise<void>}
 */
export async function applyContextToAgent({
  agent,
  sharedRunContext,
  mcpManager,
  ephemeralAgent,
  agentId,
  logger,
  configServers,
  projectContext,
}: {
  agent: AgentWithTools;
  sharedRunContext: string;
  mcpManager: MCPManager;
  ephemeralAgent?: TEphemeralAgent;
  agentId?: string;
  logger?: Logger;
  configServers?: Record<string, ParsedServerConfig>;
  /** The Project a conversation is scoped to, already resolved by the caller. */
  projectContext?: ProjectContext;
}): Promise<void> {
  const baseInstructions = agent.instructions || '';
  const additionalInstructions = agent.additional_instructions || '';
  mergeProjectContextFiles(agent, projectContext?.contextFileIds);

  try {
    const mcpServers = ephemeralAgent?.mcp?.length ? ephemeralAgent.mcp : extractMCPServers(agent);
    const mcpInstructions = await getMCPInstructionsForServers(
      mcpServers,
      mcpManager,
      logger,
      configServers,
    );

    agent.instructions = buildAgentInstructions({
      baseInstructions,
      mcpInstructions,
      projectInstructions: projectContext?.instructions,
    });
    agent.additional_instructions = buildAgentAdditionalInstructions({
      additionalInstructions,
      sharedRunContext,
    });

    if (agentId && logger) {
      logger.debug('[AgentContext] Applied context to agent');
    }
  } catch {
    agent.instructions = buildAgentInstructions({
      baseInstructions,
      mcpInstructions: '',
      projectInstructions: projectContext?.instructions,
    });
    agent.additional_instructions = buildAgentAdditionalInstructions({
      additionalInstructions,
      sharedRunContext,
    });

    if (logger) {
      logger.error('[AgentContext] Failed to apply context; using base instructions only');
    }
  }
}
