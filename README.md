# Pullsmith

Run AI agents in your CI/CD pipeline with a single YAML file.

Pullsmith connects your GitHub repo, writes a lightweight `.pullsmith` config, and installs a GitHub Actions workflow that can ask Claude Code to investigate an error, make a fix, push a branch, and open a pull request.

```bash
npm install -g pullsmith
pullsmith init
```

## What It Does

Pullsmith gives your repository an AI-powered repair loop:

1. A Sentry-style error title is passed into a GitHub Actions workflow.
2. The workflow reads your `.pullsmith` agent config.
3. Claude Code runs inside CI with your selected model and prompt.
4. If code changes are produced, Pullsmith commits them to a new branch.
5. A pull request is opened with the proposed fix.

## Quick Start

Install the CLI:

```bash
npm install -g pullsmith
```

Run setup from the root of a GitHub repository:

```bash
pullsmith init
```

Pullsmith will:

- Open your browser to authenticate with Pullsmith.
- Save CLI credentials locally at `~/.pullsmith/credentials`.
- Create a `.pullsmith` config file if one does not exist.
- Check that your repo has an Anthropic/Claude API key in GitHub Actions secrets.
- Create `.github/workflows/pullsmith.yaml`.

## Requirements

- Node.js 18 or newer.
- A GitHub repository with an `origin` remote.
- A Pullsmith account at `https://pullsmith.dev`.
- A GitHub Actions secret named `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY`.

## Commands

| Command | Description |
| --- | --- |
| `pullsmith init` | Authenticate, create `.pullsmith`, and install the GitHub Actions workflow. |
| `pullsmith validate` | Validate your `.pullsmith` file with the Pullsmith API. |
| `pullsmith doctor` | Check that the current repo is connected and ready. |

## Configuration

Pullsmith stores agent behavior in `.pullsmith`:

```yaml
sentry_agent: sentry_error_fixer

agents:
  - name: sentry_error_fixer
    prompt: |
      Investigate the error, find the root cause, and make the smallest safe fix.
    model: claude-haiku-4-5
    provider: claude
```

The generated GitHub Actions workflow reads this file to decide which agent, prompt, and model to use.

## GitHub Actions

After `pullsmith init`, your repo gets a workflow at:

```txt
.github/workflows/pullsmith.yaml
```

The workflow can be run manually with an `error` input:

```txt
Sentry error title
```

When the workflow runs, it creates a branch named like:

```txt
pullsmith/fix-your-error-title
```

Then it opens a pull request with Claude Code's proposed fix.

## Local Development

By default, the CLI talks to production:

```txt
https://pullsmith.dev
```

To point the CLI at a local Pullsmith app, set `PULLSMITH_BASE_URL`:

```bash
PULLSMITH_BASE_URL=http://localhost:3000 node bin/pullsmith.js init
PULLSMITH_BASE_URL=http://localhost:3000 node bin/pullsmith.js validate
PULLSMITH_BASE_URL=http://localhost:3000 node bin/pullsmith.js doctor
```

## Publishing

Maintainers can publish the package directly from this directory:

```bash
npm publish
```

If the version already exists on npm, bump it first:

```bash
npm version patch
npm publish
```

## Security Notes

- Pullsmith stores local CLI credentials in `~/.pullsmith/credentials`.
- Anthropic credentials should stay in GitHub Actions secrets.
- The generated workflow grants `contents: write` and `pull-requests: write` so it can push a branch and open a PR.
- Review generated pull requests before merging.

## Links

- Website: https://pullsmith.dev
- Repository: https://github.com/pullsmith/cli
- Issues: https://github.com/pullsmith/cli/issues
