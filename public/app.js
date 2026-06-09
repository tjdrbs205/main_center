const app = {
    servers: [],
    projects: [],
    environments: [],
    templates: [],
    healthStatus: {},
    currentProjectId: null,
    
    init() {
        this.bindEvents();
        this.fetchServers();
        this.fetchProjects();
        this.fetchEnvironments();
        this.fetchTemplates();
        this.fetchHealth();
        
        // Poll health every 30s
        setInterval(() => this.fetchHealth(), 30000);
    },

    bindEvents() {
        // Navigation
        document.querySelectorAll('.nav-links li').forEach(link => {
            link.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
                e.target.classList.add('active');
                
                const tab = e.target.dataset.tab;
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
                document.getElementById(tab).classList.add('active');
            });
        });

        // Forms
        document.getElementById('server-form').addEventListener('submit', this.handleServerSubmit.bind(this));
        document.getElementById('project-form').addEventListener('submit', this.handleProjectSubmit.bind(this));
        document.getElementById('environment-form').addEventListener('submit', this.handleEnvironmentSubmit.bind(this));
        document.getElementById('template-form').addEventListener('submit', this.handleTemplateSubmit.bind(this));
    },

    // --- API Calls ---
    async api(endpoint, method = 'GET', data = null) {
        const options = { method, headers: { 'Content-Type': 'application/json' } };
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

    async fetchTemplates() {
        this.templates = await this.api('template');
        this.renderTemplates();
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
            
            return `
            <tr>
                <td>
                    <strong>${p.name}</strong><br>
                    <span class="status ${statusClass}">${status}</span>
                </td>
                <td>${p.server ? p.server.name : 'Unassigned'}</td>
                <td>${p.containerName}</td>
                <td class="actions-cell">
                    <button class="btn btn-sm btn-secondary" onclick="app.editProject(${p.id})">Edit</button>
                    <button class="btn btn-sm btn-primary" onclick="app.triggerDeploy('${p.webhookToken}')">Deploy</button>
                    <button class="btn btn-sm btn-danger" onclick="app.deleteProject(${p.id})">Delete</button>
                </td>
            </tr>
        `}).join('') || '<tr><td colspan="5">No projects configured.</td></tr>';
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

    renderTemplates() {
        const tbody = document.querySelector('#templates-table tbody');
        tbody.innerHTML = this.templates.map(t => `
            <tr>
                <td><strong>${t.name}</strong></td>
                <td class="actions-cell">
                    <button class="btn btn-sm btn-secondary" onclick="app.editTemplate(${t.id})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="app.deleteTemplate(${t.id})">Delete</button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="2">No templates configured.</td></tr>';
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
        this.addEnvRow();
        document.getElementById('project-modal-title').innerText = 'Add Project';
        document.getElementById('project-modal').classList.add('active');
    },

    async editProject(id) {
        const project = await this.api(`projects/${id}`);
        document.getElementById('project-id').value = project.id;
        document.getElementById('project-name').value = project.name;
        document.getElementById('project-server').value = project.server ? project.server.id : '';
        document.getElementById('project-image').value = project.dockerImage;
        document.getElementById('project-container').value = project.containerName;
        
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

    // --- Templates CRUD ---
    openTemplateModal() {
        document.getElementById('template-form').reset();
        document.getElementById('template-id').value = '';
        document.getElementById('template-edit-title').innerText = 'Add Template';
        document.getElementById('template-edit-modal').classList.add('active');
    },

    async editTemplate(id) {
        const t = this.templates.find(x => x.id == id);
        if (!t) return;
        document.getElementById('template-id').value = t.id;
        document.getElementById('template-name').value = t.name;
        document.getElementById('template-content').value = t.content;
        document.getElementById('template-edit-title').innerText = 'Edit Template';
        document.getElementById('template-edit-modal').classList.add('active');
    },

    async handleTemplateSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('template-id').value;
        const data = {
            name: document.getElementById('template-name').value,
            content: document.getElementById('template-content').value
        };

        if (id) await this.api(`template/${id}`, 'PUT', data);
        else await this.api('template', 'POST', data);

        this.showToast(`Template ${id ? 'updated' : 'added'} successfully.`);
        this.closeModals();
        this.fetchTemplates();
    },

    async deleteTemplate(id) {
        if(confirm('Are you sure you want to delete this template?')) {
            await this.api(`template/${id}`, 'DELETE');
            this.showToast('Template deleted.');
            this.fetchTemplates();
        }
    },

    // --- Integration Guide ---
    openGuideModal() {
        const projSelect = document.getElementById('guide-project');
        const tmpSelect = document.getElementById('guide-template');
        
        projSelect.innerHTML = '<option value="">Select a project</option>' + 
            this.projects.map(p => `<option value="${p.webhookToken}">${p.name}</option>`).join('');
            
        tmpSelect.innerHTML = '<option value="">Select a template</option>' + 
            this.templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

        document.getElementById('guide-code').innerText = 'Please select a project and a template.';
        document.getElementById('guide-modal').classList.add('active');
    },

    generateGuideCode() {
        const token = document.getElementById('guide-project').value;
        const tmpId = document.getElementById('guide-template').value;
        const codeEl = document.getElementById('guide-code');

        if (!token || !tmpId) {
            codeEl.innerText = 'Please select a project and a template.';
            return;
        }

        const t = this.templates.find(x => x.id == tmpId);
        if (!t) return;

        const url = window.location.origin + '/api/webhook/deploy/' + token;
        // Basic replacement of {{WEBHOOK_TOKEN}} or {{WEBHOOK_URL}} if user used them
        let result = t.content.replace(/\{\{WEBHOOK_TOKEN\}\}/g, token);
        result = result.replace(/\{\{WEBHOOK_URL\}\}/g, url);

        codeEl.innerText = result;
    },

    copyGuideCode() {
        const text = document.getElementById('guide-code').innerText;
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('Code copied to clipboard!');
        });
    },

    // --- Actions ---
    async triggerDeploy(token) {
        this.showToast('Deploy triggered...', false);
        try {
            await this.api(`webhook/deploy/${token}`, 'POST');
            this.showToast('Deploy successful!');
            this.fetchHealth();
        } catch(e) {
            this.showToast('Deploy failed.', true);
        }
    },

    async triggerSelfUpdate() {
        if(confirm('This will trigger a docker pull and restart of this agent. Continue?')) {
            await this.api('webhook/self-update', 'POST');
            this.showToast('Self-update initiated. The service might restart soon.');
        }
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
