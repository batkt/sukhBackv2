# GitHub Actions Workflows

This directory contains GitHub Actions workflows for the amarSukhBack project.

## Available Workflows

### 1. CI (`ci.yml`)
Runs on every push and pull request to main/master/develop branches.
- Tests the code with multiple Node.js versions (18.x, 20.x)
- Installs dependencies
- Runs linter (if available)
- Checks for console statements
- Runs tests (if available)
- Performs build check

### 2. Deploy (`deploy.yml`)
Runs on pushes to main/master branch or manual trigger.
- Installs dependencies
- Deploys to server via SSH
- Restarts PM2 process

**Required Secrets:**
- `SSH_HOST` - Server hostname or IP
- `SSH_USER` - SSH username
- `SSH_PRIVATE_KEY` - SSH private key
- `SSH_PORT` - SSH port (optional, defaults to 22)
- `DEPLOY_PATH` - Path to project on server

### 3. Code Quality (`code-quality.yml`)
Runs on every push and pull request.
- Checks for TODO/FIXME comments
- Checks for console statements
- Checks for potential hardcoded secrets

## Setup Instructions

### 1. Enable GitHub Actions
GitHub Actions are automatically enabled for your repository.

### 2. Configure Secrets (for deployment)
1. Go to your repository on GitHub
2. Navigate to Settings → Secrets and variables → Actions
3. Add the following secrets:
   - `SSH_HOST`: Your server IP or hostname
   - `SSH_USER`: Your SSH username (e.g., `root` or `ubuntu`)
   - `SSH_PRIVATE_KEY`: Your SSH private key (the **ENTIRE** key, including `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----` with all newlines preserved)
   - `SSH_PORT`: SSH port (optional, default is 22)
   - `DEPLOY_PATH`: Full path to your project on server (e.g., `/home/cloudmn/sukhBack`)

**⚠️ IMPORTANT for SSH_PRIVATE_KEY:**
- Copy the ENTIRE key including BEGIN and END lines
- Preserve ALL newlines (don't remove line breaks)
- The key should look like:
  ```
  -----BEGIN RSA PRIVATE KEY-----
  MIIEpAIBAAKCAQEA...
  (many lines)
  ...
  -----END RSA PRIVATE KEY-----
  ```

See `.github/SSH_SETUP_GUIDE.md` for detailed instructions.

### 3. Generate SSH Key (if needed)
If you don't have an SSH key for deployment:
```bash
ssh-keygen -t rsa -b 4096 -C "github-actions"
```
Then add the public key to your server's `~/.ssh/authorized_keys`:
```bash
cat ~/.ssh/id_rsa.pub >> ~/.ssh/authorized_keys
```

### 4. Customize Workflows
Edit the workflow files in `.github/workflows/` to match your needs:
- Change branch names if you use different branches
- Modify deployment commands
- Add additional checks or steps

## Manual Workflow Trigger
You can manually trigger the deploy workflow:
1. Go to Actions tab in GitHub
2. Select "Deploy" workflow
3. Click "Run workflow"
4. Select branch and click "Run workflow"

## Notes
- The CI workflow runs tests but won't fail if tests don't exist
- The deploy workflow uses PM2 to manage the Node.js process
- Make sure your server has Node.js, npm, PM2, and Git installed
- The deploy path should be the root directory of your project on the server

