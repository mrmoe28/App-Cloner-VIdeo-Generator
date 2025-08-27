#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { StockSearchTool } from './tools/stock-search.js';
import { LibraryManagerTool } from './tools/library-manager.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../.env' });

const server = new Server(
  {
    name: 'ai-video-studio-stock-media',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize tool instances
const stockSearchTool = new StockSearchTool();
const libraryManagerTool = new LibraryManagerTool();

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      ...stockSearchTool.getTools(),
      ...libraryManagerTool.getTools()
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error(`No arguments provided for tool: ${name}`);
  }

  try {
    switch (name) {
      case 'search_stock_media': {
        const result = await stockSearchTool.searchStockMedia(args as any);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case 'get_trending_stock_media': {
        const result = await stockSearchTool.getTrendingMedia((args as any).type);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case 'add_to_media_library': {
        const argsCasted = args as any;
        const result = await libraryManagerTool.addToLibrary(
          argsCasted.mediaItem,
          argsCasted.tags || [],
          argsCasted.category || 'other',
          argsCasted.notes
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case 'get_library_media': {
        const result = await libraryManagerTool.getLibraryMedia(args as any);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case 'remove_from_library': {
        const result = await libraryManagerTool.removeFromLibrary((args as any).id);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: result }, null, 2)
            }
          ]
        };
      }

      case 'update_library_item': {
        const argsCasted = args as any;
        const result = await libraryManagerTool.updateLibraryItem(argsCasted.id, {
          tags: argsCasted.tags,
          category: argsCasted.category,
          notes: argsCasted.notes
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: result }, null, 2)
            }
          ]
        };
      }

      case 'get_library_stats': {
        const result = await libraryManagerTool.getLibraryStats();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ 
            error: 'Tool execution failed',
            message: errorMessage,
            tool: name
          }, null, 2)
        }
      ],
      isError: true
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AI Video Studio Stock Media MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});