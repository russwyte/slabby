# 🧱 Slabby

[![npm version](https://badge.fury.io/js/@russwyte%2Fslabby.svg)](https://badge.fury.io/js/@russwyte%2Fslabby)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

**MCP server for Slab knowledge base integration with AI coding agents**

Slabby is a [Model Context Protocol](https://modelcontextprotocol.io) server that enables AI coding agents like Claude Code, Cline, and others to read and update your Slab documentation directly. Perfect for keeping RFCs, technical docs, and team wikis in sync with your development workflow.

## Features

- 📖 **Read Slab posts** - Fetch post content by ID or URL
- ✏️ **Update Slab posts** - Edit posts with changes attributed to you
- 🔍 **Search Slab** - Find posts across your workspace
- 📋 **List posts** - Browse posts by topic or tag
- 🔐 **Secure authentication** - Uses your personal Slab API token

## Installation

### For Development

```bash
git clone https://github.com/russwyte/slabby.git
cd slabby
bun install
```

### From npm

```bash
npm install -g @russwyte/slabby
# or
bun install -g @russwyte/slabby
```

## Configuration

### 1. Get your Slab API token

1. Go to your Slab workspace → **Settings** → **API**
2. Generate a new API token
3. Copy the token (you'll need it in the next step)

### 2. Set up environment variables

Create a `.env` file in the project root:

```bash
SLAB_API_TOKEN=your-api-token-here
SLAB_TEAM=your-team-domain  # e.g., "acme" for acme.slab.com
```

**Security Note:** Never commit your `.env` file to git. It's already in `.gitignore`.

### 3. Configure Claude Code

Add Slabby to your Claude Code MCP settings:

**macOS/Linux:** `~/.config/claude-code/claude_desktop_config.json`
**Windows:** `%APPDATA%\claude-code\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "slabby": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/slabby/index.ts"],
      "env": {
        "SLAB_API_TOKEN": "your-token-here",
        "SLAB_TEAM": "your-team-domain"
      }
    }
  }
}
```

**Tip:** You can also use environment variables instead of hardcoding the token:

```json
{
  "mcpServers": {
    "slabby": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/slabby/index.ts"],
      "env": {
        "SLAB_API_TOKEN": "${SLAB_API_TOKEN}",
        "SLAB_TEAM": "${SLAB_TEAM}"
      }
    }
  }
}
```

## Usage

Once configured, Claude Code will automatically have access to these tools:

### `slab__get_post`
Fetch a Slab post by ID or URL:
```
Claude, read the Atlas RFC from https://myteam.slab.com/posts/atlas-rfc-xyz123
```

### `slab__update_post`
Update a Slab post:
```
Claude, update the Atlas RFC to reflect the single goal change
```

### `slab__search`
Search across your Slab workspace:
```
Claude, search Slab for all documents about "marketing automation"
```

### `slab__list_posts`
List posts in a topic:
```
Claude, show me all RFCs in the Engineering topic
```

## Development

### Run in development mode (with auto-reload):
```bash
bun run dev
```

### Run in production mode:
```bash
bun run start
```

### Test the MCP server:
```bash
# Using the MCP inspector (install separately)
npx @modelcontextprotocol/inspector bun run index.ts
```

## How It Works

Slabby implements the [Model Context Protocol](https://modelcontextprotocol.io), which allows AI assistants like Claude to interact with external tools and services. When you ask Claude Code to read or update Slab content, it:

1. Uses your Slab API token to authenticate
2. Makes requests to the Slab REST API
3. Returns results to Claude Code
4. All edits are attributed to your user account in Slab

## Security

- **API tokens are stored locally** - Never sent to Anthropic's servers
- **Edits show as you** - All changes attributed to your Slab account
- **Read-only by default** - Update operations require explicit permission
- **Environment-based config** - Tokens stored in `.env` (gitignored)

## Slab API Reference

This project uses the [Slab REST API v1](https://api.slab.com/). Key endpoints:

- `GET /v1/posts/:id` - Fetch post content
- `PATCH /v1/posts/:id` - Update post content
- `GET /v1/search` - Search posts
- `GET /v1/posts` - List posts

## Troubleshooting

### "Authentication failed" error
- Check that your `SLAB_API_TOKEN` is correct
- Verify the token has appropriate permissions in Slab settings

### "Team not found" error
- Ensure `SLAB_TEAM` matches your Slab subdomain (e.g., "acme" for acme.slab.com)

### Claude Code doesn't see the tools
- Restart Claude Code after updating MCP config
- Check that the absolute path to `index.ts` is correct
- Verify bun is in your PATH

## Contributing

Contributions welcome! Please feel free to submit issues, fork the repository, and send pull requests.

When contributing, please:
1. Add tests for any new functionality
2. Ensure all tests pass with `bun test`
3. Follow the existing code style
4. Update documentation as needed

## License

Copyright 2025 Russ White

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this project except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

See the [LICENSE](LICENSE) file for the full license text.

## Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io) - MCP specification
- [Claude Code](https://claude.com/code) - AI-powered development environment
- [Slab API](https://api.slab.com/) - Official Slab API documentation

---

Built with ❤️ using [Bun](https://bun.com) and the [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
