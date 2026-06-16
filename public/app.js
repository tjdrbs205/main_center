const app = {
    servers: [],
    projects: [],
    environments: [],
    healthStatus: {},
    currentProjectId: null,
    
    async init() {
        this.bindEvents();
        
        const isSetup = await this.checkSetupStatus();
        if (!isSetup) return;

        this.fetchServers();
        this.fetchProjects();
        this.fetchEnvironments();
        this.fetchSettings();
        this.fetchHealth();
        this.fetchGithubRepos();
        this.fetchSystemUpdateStatus();
        
        // Polling for health and updates every 30 seconds
        setInterval(() => {
            this.fetchHealth();
            this.fetchSystemUpdateStatus();
        }, 30000);
    },

    async checkSetupStatus() {
        try {
            const status = await this.api('settings/status/setup');
            if (!status.isGithubAppConfigured) {
                document.getElementById('initial-setup-modal').classList.add('active');
                return false;
            }
            return true;
        } catch (e) {
            console.error('Failed to check setup status', e);
            return true; // fail open to let the rest load if server error
        }
    },

    bindEvents() {
        // Navigation
        document.querySelectorAll('.nav-links li').forEach(link => {
            link.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                
                const tab = link.dataset.tab;
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
                document.getElementById(tab).classList.add('active');
            });
        });

        // Forms
        document.getElementById('server-form').addEventListener('submit', this.handleServerSubmit.bind(this));
        document.getElementById('project-form').addEventListener('submit', this.handleProjectSubmit.bind(this));
        document.getElementById('environment-form').addEventListener('submit', this.handleEnvironmentSubmit.bind(this));
        document.getElementById('settings-ghcr-form').addEventListener('submit', this.handleGhcrSubmit.bind(this));
        document.getElementById('ghcr-modal-form').addEventListener('submit', this.handleGhcrSubmit.bind(this));
        document.getElementById('initial-setup-form').addEventListener('submit', this.handleInitialSetup.bind(this));

        // Real-time YAML sync
        document.getElementById('project-image').addEventListener('input', this.syncComposeYml.bind(this));
        document.getElementById('project-container').addEventListener('input', this.syncComposeYml.bind(this));
    },

    async handleInitialSetup(e) {
        e.preventDefault();
        const clientId = document.getElementById('setup-client-id').value;
        const clientSecret = document.getElementById('setup-client-secret').value;

        try {
            await this.api('settings/GITHUB_CLIENT_ID', 'PUT', { value: clientId });
            await this.api('settings/GITHUB_CLIENT_SECRET', 'PUT', { value: clientSecret });
            
            // Redirect to GitHub OAuth login
            window.location.href = '/api/github/login';
        } catch (e) {
            // Error handled by api()
        }
    },

    syncComposeYml() {
        const composeField = document.getElementById('project-compose');
        const imageInput = document.getElementById('project-image').value;
        const containerInput = document.getElementById('project-container').value;

        let yaml = composeField.value;
        
        // Update image
        if (imageInput && /\bimage:\s*.*$/m.test(yaml)) {
            yaml = yaml.replace(/\bimage:\s*.*$/m, `image: ${imageInput}`);
        }
        
        // Update container_name
        if (containerInput && /\bcontainer_name:\s*.*$/m.test(yaml)) {
            yaml = yaml.replace(/\bcontainer_name:\s*.*$/m, `container_name: ${containerInput}`);
        }
        
        composeField.value = yaml;
    },

    // --- API Calls ---
    async api(endpoint, method = 'GET', data = null, customHeaders = {}) {
        const options = { method, headers: { 'Content-Type': 'application/json', ...customHeaders } };
        if (data) options.body = JSON.stringify(data);
        
        try {
            const res = await fetch(`/api/${endpoint}`, options);
            if (!res.ok) throw new Error(await res.text());
            return await res.json();
        } catch (e) {
            this.showToast(`Error: ${e.message}`, true);
            throw e;
        }
    },

    async fetchServers() {
        this.servers = await this.api('servers');
        this.renderServers();
        this.updateServerDropdown();
    },

    async fetchProjects() {
        this.projects = await this.api('projects');
        this.renderProjects();
        this.updateDashboard();
    },

    async fetchEnvironments() {
        this.environments = await this.api('environment');
        this.renderEnvironments();
        this.updateEnvDropdowns();
    },

    async fetchSettings() {
        // Fetch GHCR credentials status
        try {
            const [userRes, tokenRes] = await Promise.all([
                this.api('settings/GHCR_USERNAME'),
                this.api('settings/GHCR_TOKEN'),
            ]);
            this.hasGhcr = !!(userRes.value && tokenRes.isSet);
            
            if (this.hasGhcr) {
                document.getElementById('settings-ghcr-unconfigured').style.display = 'none';
                document.getElementById('settings-ghcr-configured').style.display = 'block';
            } else {
                document.getElementById('settings-ghcr-unconfigured').style.display = 'block';
                document.getElementById('settings-ghcr-configured').style.display = 'none';
            }
        } catch(e) {
            this.hasGhcr = false;
        }
        
        this.renderProjects();
    },

    // --- System Updates ---
    async fetchSystemUpdateStatus() {
        try {
            const status = await this.api('settings/system-update/status');
            
            // Update Settings UI
            document.getElementById('system-auto-update-toggle').checked = status.autoUpdate;
            
            const digestStr = status.lastDigest ? status.lastDigest.substring(0, 15) + '...' : 'Unknown';
            document.getElementById('system-update-digest-text').innerText = `Last Digest: ${digestStr}`;

            const statusText = document.getElementById('system-update-status-text');
            const updateBtn = document.getElementById('system-update-btn');
            const banner = document.getElementById('system-update-banner');

            if (status.updateAvailable) {
                statusText.innerHTML = `<span style="color: var(--warning);">⚠️ Update Available</span>`;
                updateBtn.style.display = 'inline-flex';
                banner.style.display = 'flex';
            } else {
                statusText.innerHTML = `<span style="color: var(--success);">✓ Up to date</span>`;
                updateBtn.style.display = 'none';
                banner.style.display = 'none';
            }
        } catch (e) {
            console.error('Failed to fetch system update status', e);
        }
    },

    async checkSystemUpdate() {
        this.showToast('Checking for system updates...', 'info');
        try {
            const res = await this.api('settings/system-update/check', 'POST');
            if (res.available) {
                this.showToast('New update found!', 'success');
            } else {
                this.showToast('System is up to date.');
            }
            this.fetchSystemUpdateStatus();
        } catch (e) {
            this.showToast('Failed to check for updates.', 'error');
        }
    },

    async triggerSystemUpdate() {
        if (!confirm('This will download the latest Main Center image and restart the agent. The UI will become temporarily unavailable. Proceed?')) return;
        
        try {
            const response = await fetch('/api/settings/self-update', {
                method: 'POST'
            });

            if (response.ok) {
                this.showToast('Self-update initiated. The system will restart shortly.');
                setTimeout(() => {
                    window.location.reload();
                }, 10000);
            } else {
                const txt = await response.text();
                this.showToast(`Self-update failed: ${txt}`, true);
            }
        } catch (e) {
            this.showToast('Failed to trigger update.', true);
        }
    },

    async toggleSystemAutoUpdate(e) {
        const isEnabled = e.target.checked;
        await this.api('settings', 'POST', { key: 'MAIN_CENTER_AUTO_UPDATE', value: isEnabled ? 'true' : 'false' });
        this.showToast(`Auto update ${isEnabled ? 'enabled' : 'disabled'}.`);
    },

    async fetchHealth() {
        this.healthStatus = await this.api('health');
        this.updateDashboard();
        this.renderProjects();
    },

    // --- Renderers ---
    renderServers() {
        const tbody = document.querySelector('#servers-table tbody');
        tbody.innerHTML = this.servers.map(s => `
            <tr>
                <td><strong>${s.name}</strong></td>
                <td>${s.ipOrHostname}</td>
                <td>${s.username}</td>
                <td class="actions-cell">
                    <button class="btn btn-sm btn-secondary" onclick="app.editServer(${s.id})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="app.deleteServer(${s.id})">Delete</button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="4">No servers configured.</td></tr>';
    },

    renderProjects() {
        const tbody = document.querySelector('#projects-table tbody');
        tbody.innerHTML = this.projects.map(p => {
            const status = this.healthStatus[p.id] || 'unknown';
            const statusClass = status.includes('running') || status.includes('Up') ? 'status-running' : (status === 'unknown' ? 'status-unknown' : 'status-down');
            
            let updateStatus = '';
            if (p.updateAvailable) {
                updateStatus = `<span style="background: #f59e0b; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 11px;">Update Available</span>`;
            } else if (p.autoUpdate) {
                updateStatus = `<span style="background: rgba(255,255,255,0.1); color: var(--text-secondary); padding: 2px 6px; border-radius: 4px; font-size: 11px;">Auto Update On</span>`;
            } else {
                updateStatus = `<span style="color: var(--text-secondary); font-size: 11px;">Manual</span>`;
            }

            return `
            <tr>
                <td>
                    <strong>${p.name}</strong><br>
                    <span class="status ${statusClass}">${status}</span>
                </td>
                <td>${p.server ? p.server.name : 'Unassigned'}</td>
                <td>${p.containerName}</td>
                <td>${p.githubRepo || '<span style="color:var(--text-secondary)">None</span>'}</td>
                <td>${updateStatus}</td>
                <td class="actions-cell">
                    <button class="btn btn-sm btn-secondary" onclick="app.editProject(${p.id})">Edit</button>
                    ${p.updateAvailable 
                        ? `<button class="btn btn-sm btn-primary" onclick="app.manualDeploy(${p.id})" style="background: #f59e0b; color: #fff; border: none;">Update Now</button>`
                        : `<button class="btn btn-sm btn-primary" onclick="app.manualDeploy(${p.id})">Deploy</button>`
                    }
                    <button class="btn btn-sm btn-danger" onclick="app.deleteProject(${p.id})">Delete</button>
                </td>
            </tr>
        `}).join('') || '<tr><td colspan="6">No projects configured.</td></tr>';
    },

    renderEnvironments() {
        const tbody = document.querySelector('#environments-table tbody');
        tbody.innerHTML = this.environments.map(e => `
            <tr>
                <td><strong>${e.key}</strong></td>
                <td>${e.value}</td>
                <td>${e.description || ''}</td>
                <td class="actions-cell">
                    <button class="btn btn-sm btn-secondary" onclick="app.editEnvironment(${e.id})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="app.deleteEnvironment(${e.id})">Delete</button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="4">No environments configured.</td></tr>';
    },

    updateServerDropdown() {
        const select = document.getElementById('project-server');
        select.innerHTML = '<option value="">Select a server...</option>' + 
            this.servers.map(s => `<option value="${s.id}">${s.name} (${s.ipOrHostname})</option>`).join('');
    },

    updateEnvDropdowns() {
        const select = document.getElementById('env-select-dropdown');
        select.innerHTML = '<option value="">Select an environment to add...</option>' + 
            this.environments.map(e => `<option value="${e.id}">${e.key}</option>`).join('');
    },

    updateDashboard() {
        const upCount = Object.values(this.healthStatus).filter(s => s.includes('running') || s.includes('Up')).length;
        document.getElementById('dashboard-stats').innerHTML = `
            <div class="stat-card">
                <h3>Total Servers</h3>
                <div class="value">${this.servers.length}</div>
            </div>
            <div class="stat-card">
                <h3>Total Projects</h3>
                <div class="value">${this.projects.length}</div>
            </div>
            <div class="stat-card">
                <h3>Running Containers</h3>
                <div class="value" style="color: var(--success)">${upCount}</div>
            </div>
        `;
    },

    // --- Modals & Forms ---
    closeModals() {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    },

    openServerModal() {
        document.getElementById('server-form').reset();
        document.getElementById('server-id').value = '';
        document.getElementById('server-modal-title').innerText = 'Add Server';
        document.getElementById('server-modal').classList.add('active');
    },

    async editServer(id) {
        const server = await this.api(`servers/${id}`);
        document.getElementById('server-id').value = server.id;
        document.getElementById('server-name').value = server.name;
        document.getElementById('server-ip').value = server.ipOrHostname;
        document.getElementById('server-user').value = server.username;
        document.getElementById('server-key').value = server.privateKey || '';
        document.getElementById('server-pass').value = '';
        document.getElementById('server-modal-title').innerText = 'Edit Server';
        document.getElementById('server-modal').classList.add('active');
    },

    async handleServerSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('server-id').value;
        const data = {
            name: document.getElementById('server-name').value,
            ipOrHostname: document.getElementById('server-ip').value,
            username: document.getElementById('server-user').value,
        };
        const key = document.getElementById('server-key').value;
        const pass = document.getElementById('server-pass').value;
        if (key) data.privateKey = key;
        if (pass) data.password = pass;

        if (id) await this.api(`servers/${id}`, 'PUT', data);
        else await this.api('servers', 'POST', data);

        this.showToast(`Server ${id ? 'updated' : 'added'} successfully.`);
        this.closeModals();
        this.fetchServers();
    },

    async deleteServer(id) {
        if(confirm('Are you sure you want to delete this server?')) {
            await this.api(`servers/${id}`, 'DELETE');
            this.showToast('Server deleted.');
            this.fetchServers();
        }
    },

    openProjectModal() {
        document.getElementById('project-form').reset();
        document.getElementById('project-id').value = '';
        document.getElementById('env-list').innerHTML = '';
        document.getElementById('project-github-repo').value = '';
        document.getElementById('project-auto-update').checked = false;
        
        // Default Compose YAML
        document.getElementById('project-compose').value = `version: '3.8'
services:
  app:
    image: ghcr.io/username/repo:latest
    container_name: app_name
    restart: unless-stopped
    ports:
      - "8080:8080"
    env_file:
      - .env`;

        this.addEnvRow();
        document.getElementById('project-modal-title').innerText = 'Add Project';
        document.getElementById('project-modal').classList.add('active');
    },

    async editProject(id) {
        const project = await this.api(`projects/${id}`);
        document.getElementById('project-id').value = project.id;
        document.getElementById('project-name').value = project.name;
        document.getElementById('project-server').value = project.server ? project.server.id : '';
        document.getElementById('project-image').value = project.dockerImage || '';
        document.getElementById('project-container').value = project.containerName || '';
        document.getElementById('project-compose').value = project.composeYaml || `version: '3.8'\nservices:\n  app:\n    image: ${project.dockerImage}\n    container_name: ${project.containerName}\n    env_file:\n      - .env`;
        document.getElementById('project-github-repo').value = project.githubRepo || '';
        document.getElementById('project-auto-update').checked = project.autoUpdate || false;
        
        document.getElementById('env-list').innerHTML = '';
        if (project.environments && project.environments.length > 0) {
            project.environments.forEach(env => this.addEnvRow(env.id, env.key, env.value));
        } else {
            this.addEnvRow();
        }

        document.getElementById('project-modal-title').innerText = 'Edit Project';
        document.getElementById('project-modal').classList.add('active');
    },

    async handleProjectSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('project-id').value;
        const data = {
            name: document.getElementById('project-name').value,
            dockerImage: document.getElementById('project-image').value,
            containerName: document.getElementById('project-container').value,
            composeYaml: document.getElementById('project-compose').value,
            githubRepo: document.getElementById('project-github-repo').value || null,
            autoUpdate: document.getElementById('project-auto-update').checked,
            server: { id: document.getElementById('project-server').value }
        };

        // Resolve environments
        const envRows = document.querySelectorAll('.env-row');
        const envs = [];
        for (const row of envRows) {
            let envId = row.querySelector('.env-db-id').value;
            const key = row.querySelector('.env-key').value;
            const val = row.querySelector('.env-val').value;
            
            if (key) {
                if (!envId) {
                    // Create new custom environment variable in global pool
                    const newEnv = await this.api('environment', 'POST', { key, value: val });
                    envId = newEnv.id;
                } else {
                    // Update the existing environment variable if value changed
                    await this.api(`environment/${envId}`, 'PUT', { key, value: val });
                }
                envs.push({ id: envId });
            }
        }
        data.environments = envs;

        let project;
        if (id) project = await this.api(`projects/${id}`, 'PUT', data);
        else project = await this.api('projects', 'POST', data);

        this.showToast(`Project ${id ? 'updated' : 'added'} successfully.`);
        this.closeModals();
        this.fetchProjects();
    },

    async deleteProject(id) {
        if(confirm('Are you sure you want to delete this project?')) {
            await this.api(`projects/${id}`, 'DELETE');
            this.showToast('Project deleted.');
            this.fetchProjects();
        }
    },

    async rotateProjectToken() {
        const id = document.getElementById('project-id').value;
        if (!id) return;
        if(confirm('Are you sure you want to rotate the webhook token? The old token will stop working immediately.')) {
            await this.api(`projects/${id}/rotate-token`, 'POST');
            this.showToast('Webhook token rotated successfully.');
            this.fetchProjects();
        }
    },

    addEnvRow(envId = null, key = '', val = '') {
        const list = document.getElementById('env-list');
        const id = Date.now() + Math.random().toString(36).substr(2, 5);
        const div = document.createElement('div');
        div.className = 'env-row';
        div.id = `env-${id}`;
        div.innerHTML = `
            <input type="hidden" class="env-db-id" value="${envId || ''}">
            <input type="text" class="env-key" placeholder="KEY" value="${key}" style="flex: 1">
            <input type="text" class="env-val" placeholder="VALUE" value="${val}" style="flex: 2">
            <button type="button" class="btn btn-danger" onclick="document.getElementById('env-${id}').remove()">X</button>
        `;
        list.appendChild(div);
    },

    addEnvFromPool() {
        const select = document.getElementById('env-select-dropdown');
        const id = select.value;
        if (!id) return;
        const env = this.environments.find(e => e.id == id);
        if (env) {
            this.addEnvRow(env.id, env.key, env.value);
            select.value = '';
        }
    },

    // --- Environments CRUD ---
    openEnvironmentModal() {
        document.getElementById('environment-form').reset();
        document.getElementById('environment-id').value = '';
        document.getElementById('environment-title').innerText = 'Add Environment';
        document.getElementById('environment-modal').classList.add('active');
    },

    async editEnvironment(id) {
        const env = this.environments.find(e => e.id == id);
        if (!env) return;
        document.getElementById('environment-id').value = env.id;
        document.getElementById('environment-key').value = env.key;
        document.getElementById('environment-value').value = env.value;
        document.getElementById('environment-description').value = env.description || '';
        document.getElementById('environment-title').innerText = 'Edit Environment';
        document.getElementById('environment-modal').classList.add('active');
    },

    async handleEnvironmentSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('environment-id').value;
        const data = {
            key: document.getElementById('environment-key').value,
            value: document.getElementById('environment-value').value,
            description: document.getElementById('environment-description').value
        };

        if (id) await this.api(`environment/${id}`, 'PUT', data);
        else await this.api('environment', 'POST', data);

        this.showToast(`Environment ${id ? 'updated' : 'added'} successfully.`);
        this.closeModals();
        this.fetchEnvironments();
    },

    async deleteEnvironment(id) {
        if(confirm('Are you sure you want to delete this environment variable?')) {
            await this.api(`environment/${id}`, 'DELETE');
            this.showToast('Environment deleted.');
            this.fetchEnvironments();
        }
    },

    // --- Settings ---
    openGhcrModal() {
        document.getElementById('ghcr-modal-form').reset();
        document.getElementById('ghcr-modal').classList.add('active');
    },

    async handleGhcrSubmit(e) {
        e.preventDefault();
        
        const isModal = document.getElementById('ghcr-modal').classList.contains('active');
        const username = isModal
            ? document.getElementById('modal-ghcr-username').value
            : document.getElementById('setting-ghcr-username').value;
        const token = isModal
            ? document.getElementById('modal-ghcr-token').value
            : document.getElementById('setting-ghcr-token').value;
            
        if (!username || !token) {
            this.showToast('Please fill in both Username and Token.', true);
            return;
        }
        
        await this.api('settings/GHCR_USERNAME', 'PUT', { value: username });
        await this.api('settings/GHCR_TOKEN', 'PUT', { value: token });
        this.showToast('GHCR credentials saved successfully.');
        
        if (isModal) {
            this.closeModals();
        } else {
            document.getElementById('setting-ghcr-username').value = '';
            document.getElementById('setting-ghcr-token').value = '';
        }
        
        this.fetchSettings();
    },

    // --- Integration Guide ---
    openGuideModal() {
        const projSelect = document.getElementById('guide-project');
        
        projSelect.innerHTML = '<option value="">Select a project</option>' + 
            this.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

        document.getElementById('guide-code').innerText = 'Please select a project.';
        document.getElementById('guide-modal').classList.add('active');
    },

    generateGuideCode() {
        const projectId = document.getElementById('guide-project').value;
        if (!projectId) return;
        
        const project = this.projects.find(p => p.id == projectId);
        if (!project) return;
        
        const imageString = project.dockerImage || 'ghcr.io/username/repo:latest';
        
        const code = `name: Build and Push
on:
  push:
    branches: [ main ]
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${imageString}`;
        
        document.getElementById('guide-code').innerText = code;
    },

    copyGuideCode() {
        const text = document.getElementById('guide-code').innerText;
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('Code copied to clipboard!');
        });
    },

    async checkUpdates() {
        this.showToast('Checking for updates...', false);
        try {
            const res = await this.api('projects/check-updates', 'POST');
            this.showToast(`Update check complete. Updated ${res.updatedProjects || 0} projects.`);
            this.fetchProjects();
        } catch(e) {
            this.showToast('Failed to check for updates.', true);
        }
    },

    async manualDeploy(projectId) {
        this.showToast('Deployment started...', false);
        try {
            await this.api(`projects/${projectId}/deploy`, 'POST');
            this.showToast('Deployment successful!');
            this.fetchHealth();
            this.fetchProjects();
        } catch(e) {
            this.showToast('Deployment failed.', true);
        }
    },

    async fetchGithubRepos() {
        try {
            const repos = await this.api('github/repos');
            const select = document.getElementById('project-github-repo');
            select.innerHTML = '<option value="">-- None (Manual Image Only) --</option>';
            repos.forEach(repo => {
                const opt = document.createElement('option');
                opt.value = repo.name;
                opt.innerText = repo.name + (repo.private ? ' 🔒' : '');
                select.appendChild(opt);
            });
        } catch (e) {
            console.error('Failed to fetch github repos');
        }
    },

    switchTab(tabName) {
        document.querySelectorAll('.nav-links li').forEach(l => {
            l.classList.remove('active');
            if (l.dataset.tab === tabName) l.classList.add('active');
        });
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const target = document.getElementById(tabName);
        if (target) target.classList.add('active');
    },

    showToast(msg, isError = false) {
        const t = document.getElementById('toast');
        t.innerText = msg;
        t.style.borderLeft = `4px solid ${isError ? 'var(--danger)' : 'var(--primary)'}`;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 3000);
    }
};

window.onload = () => app.init();
