#!/usr/bin/env bun

/**
 * Copyright 2025 Russ White
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Slabby - MCP Server for Slab Knowledge Base Integration
 *
 * Enables Claude Code to read and update Slab documentation.
 * All edits are attributed to the user who owns the API token.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { SlabClient } from "./client.ts";
import { formatPostResponse, formatSearchResults, formatListResults } from "./formatters.ts";
import { extractPostId } from "./utils.ts";

// Environment configuration
const SLAB_API_TOKEN = process.env.SLAB_API_TOKEN;
const SLAB_TEAM = process.env.SLAB_TEAM;

if (!SLAB_API_TOKEN) {
  console.error("Error: SLAB_API_TOKEN environment variable is required");
  process.exit(1);
}

if (!SLAB_TEAM) {
  console.error("Error: SLAB_TEAM environment variable is required");
  process.exit(1);
}

const SLAB_API_BASE = `https://${SLAB_TEAM}.slab.com/api/v1`;

// Initialize Slab client
const slab = new SlabClient({
  token: SLAB_API_TOKEN,
  baseUrl: SLAB_API_BASE,
});

// Create MCP server
const server = new Server(
  {
    name: "slabby",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "slab__get_post",
        description: "Fetch a Slab post by ID or URL. Returns the post content in markdown format.",
        inputSchema: {
          type: "object",
          properties: {
            postId: {
              type: "string",
              description: "The Slab post ID or full post URL (e.g., 'abc123' or 'https://team.slab.com/posts/abc123')",
            },
          },
          required: ["postId"],
        },
      },
      {
        name: "slab__update_post",
        description: "Update a Slab post with new content. Edits will be attributed to your user account.",
        inputSchema: {
          type: "object",
          properties: {
            postId: {
              type: "string",
              description: "The Slab post ID or full post URL",
            },
            content: {
              type: "string",
              description: "The new content for the post in markdown format",
            },
          },
          required: ["postId", "content"],
        },
      },
      {
        name: "slab__search",
        description: "Search for posts across your Slab workspace",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query string",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "slab__list_posts",
        description: "List posts in your Slab workspace, optionally filtered by topic",
        inputSchema: {
          type: "object",
          properties: {
            topicId: {
              type: "string",
              description: "Optional topic ID to filter posts",
            },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    return {
      content: [
        {
          type: "text",
          text: "Error: Missing required arguments",
        },
      ],
      isError: true,
    };
  }

  try {
    switch (name) {
      case "slab__get_post": {
        const postId = extractPostId(args.postId as string);
        const post = await slab.getPost(postId);
        return {
          content: [
            {
              type: "text",
              text: formatPostResponse(post),
            },
          ],
        };
      }

      case "slab__update_post": {
        const postId = extractPostId(args.postId as string);
        const result = await slab.updatePost(postId, args.content as string);
        return {
          content: [
            {
              type: "text",
              text: `Post updated successfully: ${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }

      case "slab__search": {
        const query = args.query as string;
        const results = await slab.searchPosts(query);
        return {
          content: [
            {
              type: "text",
              text: formatSearchResults(results, query),
            },
          ],
        };
      }

      case "slab__list_posts": {
        const posts = await slab.listPosts(args.topicId as string | undefined);
        return {
          content: [
            {
              type: "text",
              text: formatListResults(posts),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Slabby MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
