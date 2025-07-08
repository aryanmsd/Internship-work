const API_BASE_URL = 'http://192.168.29.93:3001/api';
let currentUser = null;
let tasks = [];
let selectedPdfFile = null;
let notificationCheckInterval = null;

window.onload = function() {
    checkAuth();
    setupEventListeners();
    initializePdfUpload();
    requestNotificationPermission();
    startNotificationChecker();
};

function checkAuth() {
    const userData = sessionStorage.getItem('currentUser');
    if (!userData) {
        alert('Please log in first');
        window.location.href = 'index.html';
        return;
    }
    currentUser = JSON.parse(userData);
    document.querySelector('.user-info span').textContent = `Welcome, ${currentUser.username}!`;
    loadTasks();
}

function setupEventListeners() {
    document.getElementById('taskForm').addEventListener('submit', function(e) {
        e.preventDefault();
        handleFormSubmit();
    });
    document.getElementById('hasDeadline').addEventListener('change', toggleDeadlineTime);
    
    // Add listener for task title input to update button
    const taskTitleInput = document.getElementById('taskTitle');
    if (taskTitleInput) {
        taskTitleInput.addEventListener('input', updateAddButton);
    }
}

function toggleDeadlineTime() {
    const deadlineGroup = document.getElementById('deadlineTimeGroup');
    const isChecked = document.getElementById('hasDeadline').checked;
    deadlineGroup.style.display = isChecked ? 'block' : 'none';
}

async function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        console.log('Notification permission:', permission);
    }
}

function startNotificationChecker() {
    notificationCheckInterval = setInterval(checkUpcomingDeadlines, 30000);
    checkUpcomingDeadlines();
}

function checkUpcomingDeadlines() {
    if (!tasks || tasks.length === 0) return;
    
    const now = new Date();
    const upcoming = new Date(now.getTime() + 30 * 60000); 
    console.log('Checking deadlines at:', now.toLocaleTimeString());
    
    tasks.forEach(task => {
        if (task.hasDeadline && task.deadlineTime && task.dueDate && !task.completed) {
            let taskDate = task.dueDate;
            if (taskDate.includes('T')) {
                taskDate = taskDate.split('T')[0]; 
            }
            const taskDateTime = new Date(`${taskDate}T${task.deadlineTime}:00`);
            console.log(`Task: ${task.title}, Deadline: ${taskDateTime}, Now: ${now}, Upcoming: ${upcoming}`);
            
            if (taskDateTime > now && taskDateTime <= upcoming) {
                const key = `notified_${task._id}_${taskDateTime.getTime()}`;
                if (!sessionStorage.getItem(key)) {
                    console.log(`Showing notification for task: ${task.title}`);
                    showDeadlineNotification(task, taskDateTime);
                    sessionStorage.setItem(key, 'true');
                }
            }
        }
    });
}

function showDeadlineNotification(task, deadlineDateTime) {
    const minutesLeft = Math.round((deadlineDateTime - new Date()) / 60000);
    if (Notification.permission === 'granted') {
        const notification = new Notification('Task Deadline Approaching!', {
            body: `"${task.title}" is due in ${minutesLeft} minutes`,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📋</text></svg>',
            tag: task._id,
            requireInteraction: true
        });
        setTimeout(() => notification.close(), 10000);
        notification.onclick = function() {
            window.focus();
            notification.close();
        };
    }
    showInPageNotification(task.title, minutesLeft);
}

function showInPageNotification(taskTitle, minutesLeft) {
    const existingNotifications = document.querySelectorAll('.notification.deadline-alert');
    existingNotifications.forEach(n => n.remove());
    
    const div = document.createElement('div');
    div.className = 'notification deadline-alert';
    div.innerHTML = `
        <button class="notification-close" onclick="this.parentElement.remove()">&times;</button>
        <div class="notification-title">⏰ Task Deadline Approaching!</div>
        <div class="notification-message">"${taskTitle}" is due in ${minutesLeft} minutes</div>
    `;
    
    document.body.appendChild(div);
    setTimeout(() => {
        if (div.parentElement) {
            div.remove();
        }
    }, 15000);
}

async function loadTasks() {
    try {
        const res = await fetch(`${API_BASE_URL}/tasks/${currentUser.id}`);
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        const data = await res.json();
        tasks = data.tasks || [];
        console.log('Loaded tasks:', tasks);
        displayTasks();
    } catch (err) {
        console.error('Failed to load tasks:', err);
        alert('Failed to load tasks. Please refresh the page.');
    }
}

async function handleFormSubmit() {
    const title = document.getElementById('taskTitle').value.trim();
    const hasPdf = selectedPdfFile !== null;

    console.log('Form submit - Title:', title, 'Has PDF:', hasPdf);

    if (!title && !hasPdf) {
        alert('Please enter a task title or select a PDF file');
        return;
    }

    try {
        if (title && hasPdf) {
            if (confirm('You have both a task title and a PDF file. Do you want to add the manual task AND process the PDF?')) {
                await addManualTask();
                await processPdf();
            } else {
                return;
            }
        } else if (hasPdf && !title) {
            console.log('Processing PDF only');
            await processPdf();
        } else if (title && !hasPdf) {
            console.log('Adding manual task only');
            await addManualTask();
        }

        await loadTasks();  // ✅ force reloading tasks from DB
        resetForm();
    } catch (error) {
        console.error('Form submission error:', error);
    }
}

// Add manual task from form inputs
async function addManualTask() {
    const title = document.getElementById('taskTitle').value.trim();
    const dueDate = document.getElementById('taskDueDate').value;
    const priority = document.getElementById('taskPriority').value;
    const hasDeadline = document.getElementById('hasDeadline').checked;
    const deadlineTime = document.getElementById('deadlineTime').value;

    if (hasDeadline && (!dueDate || !deadlineTime)) {
        alert('Please set both due date and deadline time when enabling deadline notifications');
        throw new Error('Missing deadline information');
    }

    const taskData = {
        title,
        dueDate: dueDate || null,
        priority,
        hasDeadline,
        deadlineTime: hasDeadline ? deadlineTime : null
    };

    try {
        const res = await fetch(`${API_BASE_URL}/tasks/${currentUser.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData)
        });

        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const result = await res.json();
        tasks.push(result.task);
        console.log('Manual task added:', result.task);
        
    } catch (err) {
        console.error('Add manual task failed:', err);
        alert('Failed to add task. Please try again.');
        throw err;
    }
}

// Process PDF and extract tasks
async function processPdf() {
    if (!selectedPdfFile) {
        alert('Please select a PDF file first');
        return;
    }

    console.log('Starting PDF processing...');
    const overlay = document.getElementById('processingOverlay');
    overlay.style.display = 'flex';

    try {
        const text = await extractTextFromPdf(selectedPdfFile);
        console.log('Extracted text length:', text.length);
        
        const extractedTasks = parseTasksFromText(text);
        console.log('Extracted tasks:', extractedTasks);
        
        if (extractedTasks.length === 0) {
            alert('No tasks found in the PDF. Please check the format or add tasks manually.');
            return;
        }

        // Add each extracted task
        let successCount = 0;
        for (const taskData of extractedTasks) {
            try {
                await addExtractedTask(taskData);
                successCount++;
            } catch (err) {
                console.error('Failed to add extracted task:', taskData, err);
            }
        }

        if (successCount > 0) {
            alert(`Successfully added ${successCount} tasks from PDF!`);
        } else {
            alert('Failed to add tasks from PDF. Please try again or add tasks manually.');
        }
        
    } catch (error) {
        console.error('PDF processing error:', error);
        alert('Failed to process PDF. Please try again or add tasks manually.');
    } finally {
        overlay.style.display = 'none';
        await loadTasks(); // ensures you get full data with _id
        checkUpcomingDeadlines(); // force notification check after upload
    }
}

async function addExtractedTask(taskData) {
    try {
        const res = await fetch(`${API_BASE_URL}/tasks/${currentUser.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData)
        });

        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const result = await res.json();
        tasks.push(result.task);
        console.log('Extracted task added:', result.task);
        
    } catch (err) {
        console.error('Add extracted task failed:', err);
        throw err;
    }
}

// Reset form after successful submission
function resetForm() {
    document.getElementById('taskForm').reset();
    document.getElementById('pdfFile').value = '';
    selectedPdfFile = null;
    document.getElementById('fileInfo').classList.remove('show');
    toggleDeadlineTime();
    updateAddButton();
}

function displayTasks() {
    const container = document.getElementById('tasksList');
    container.innerHTML = '';

    if (tasks.length === 0) {
        container.innerHTML = '<div class="no-tasks">No tasks found</div>';
        return;
    }
    
    const sortedTasks = [...tasks].sort((a, b) => {
        if (a.completed && !b.completed) return 1;
        if (!a.completed && b.completed) return -1;
        
        if (a.hasDeadline && b.hasDeadline) {
            const dateA = new Date(`${a.dueDate}T${a.deadlineTime || '00:00'}`);
            const dateB = new Date(`${b.dueDate}T${b.deadlineTime || '00:00'}`);
            return dateA - dateB;
        }
        
        return new Date(b.createdAt) - new Date(a.createdAt);
    });

    sortedTasks.forEach(task => {
        const div = document.createElement('div');
        div.className = `task-item ${task.completed ? 'completed' : ''} priority-${task.priority}`;
        
        let dueDateDisplay = '';
        if (task.hasDeadline && task.dueDate && task.deadlineTime) {
            const taskDateTime = new Date(`${task.dueDate}T${task.deadlineTime}:00`);
            const now = new Date();
            const isUrgent = taskDateTime <= new Date(now.getTime() + 2 * 60 * 60 * 1000);
            
            dueDateDisplay = `<span class="task-deadline ${isUrgent ? 'urgent' : ''}">
                📅 Due: ${new Date(task.dueDate).toLocaleDateString()} at ${task.deadlineTime}
                ${isUrgent && !task.completed ? ' (URGENT)' : ''}
            </span>`;
        } else if (task.dueDate) {
            dueDateDisplay = `<span class="task-deadline">📅 Due: ${new Date(task.dueDate).toLocaleDateString()}</span>`;
        }
        
        div.innerHTML = `
            <div class="task-header">
                <h3 class="task-title">${task.title}</h3>
                <div class="task-actions">
                    <button onclick="toggleTaskCompletion('${task._id}')" class="action-btn complete-btn">
                        ${task.completed ? '↩️' : '✅'}
                    </button>
                    <button onclick="deleteTask('${task._id}')" class="action-btn delete-btn">🗑️</button>
                </div>
            </div>
            <div class="task-meta">
                <span class="task-priority">🔥 ${task.priority.toUpperCase()}</span>
                ${dueDateDisplay}
                ${task.hasDeadline && !task.completed ? '<span style="color: #e17055;">🔔 Notifications enabled</span>' : ''}
            </div>
        `;
        container.appendChild(div);
    });
}

async function toggleTaskCompletion(taskId) {
    const task = tasks.find(t => t._id === taskId);
    if (!task) return;

    try {
        const res = await fetch(`${API_BASE_URL}/tasks/${currentUser.id}/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'toggle' })
        });
        
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        task.completed = !task.completed;
        displayTasks();
    } catch (err) {
        console.error('Toggle complete failed:', err);
        alert('Failed to update task. Please try again.');
    }
}

async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    try {
        const res = await fetch(`${API_BASE_URL}/tasks/${currentUser.id}/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete' })
        });
        
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        tasks = tasks.filter(t => t._id !== taskId);
        displayTasks();
    } catch (err) {
        console.error('Delete task failed:', err);
        alert('Failed to delete task. Please try again.');
    }
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        sessionStorage.removeItem('currentUser');
        if (notificationCheckInterval) {
            clearInterval(notificationCheckInterval);
        }
        window.location.href = 'index.html';
    }
}

function initializePdfUpload() {
    const input = document.getElementById('pdfFile');
    const area = document.getElementById('fileUploadArea');
    
    area.addEventListener('click', () => input.click());
    
    area.addEventListener('dragover', (e) => {
        e.preventDefault();
        area.classList.add('dragover');
    });
    
    area.addEventListener('dragleave', () => {
        area.classList.remove('dragover');
    });
    
    area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            input.files = files;
            handleFileSelection(files[0]);
        }
    });
    
    input.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            handleFileSelection(file);
        }
    });
}

function handleFileSelection(file) {
    if (file && file.type === 'application/pdf') {
        if (file.size > 10 * 1024 * 1024) { 
            alert('File too large. Please upload a PDF smaller than 10MB.');
            return;
        }
        
        selectedPdfFile = file;
        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileSize').textContent = (file.size / 1024 / 1024).toFixed(2) + ' MB';
        document.getElementById('fileInfo').classList.add('show');
        updateAddButton();
        console.log('PDF file selected:', file.name);
    } else {
        alert('Invalid file. Please upload a PDF file.');
        document.getElementById('pdfFile').value = '';
        selectedPdfFile = null;
        document.getElementById('fileInfo').classList.remove('show');
        updateAddButton();
    }
}

async function extractTextFromPdf(file) {
    return new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        
        fileReader.onload = async function() {
            try {
                const typedArray = new Uint8Array(this.result);
                const pdf = await pdfjsLib.getDocument(typedArray).promise;
                let fullText = '';
                
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    fullText += pageText + '\n';
                }
                
                resolve(fullText);
            } catch (error) {
                reject(error);
            }
        };
        
        fileReader.onerror = () => reject(new Error('Failed to read file'));
        fileReader.readAsArrayBuffer(file);
    });
}

function parseTasksFromText(text) {
    const tasks = [];
    console.log('Original PDF text:', text);

    // Clean the text and handle different line break formats
    let cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Split into individual lines
    let lines = cleanText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // If we got everything in one line (common with PDF extraction), 
    // try to split by task patterns
    if (lines.length === 1) {
        const singleLine = lines[0];
        // Look for patterns where a new task starts - typically with a capital letter after some metadata
        // Split before patterns like "Submit", "Prepare", "Buy" etc.
        lines = singleLine.split(/(?=\b[A-Z][a-z]+\s+[a-z]+)/).filter(line => line.trim().length > 0);
        
        // If still one line, try splitting by "Priority:" as it often ends a task
        if (lines.length === 1) {
            lines = singleLine.split(/Priority:\s*(?:High|Medium|Low)\s*/).filter(line => line.trim().length > 0);
            // Add back the priority info that got removed by split
            for (let i = 0; i < lines.length - 1; i++) {
                const priorityMatch = singleLine.match(new RegExp(lines[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*Priority:\\s*(High|Medium|Low)', 'i'));
                if (priorityMatch) {
                    lines[i] += ' Priority: ' + priorityMatch[1];
                }
            }
        }
    }
    
    console.log('Split lines:', lines);

    for (const line of lines) {
        if (line.trim().length < 5) continue; // Skip very short lines
        
        console.log('Processing line:', line);
        
        const task = {
            title: '',
            dueDate: null,
            deadlineTime: null,
            hasDeadline: false,
            priority: 'medium'
        };

        let workingLine = line;

        // Extract and remove due date
        const dateMatch = workingLine.match(/Due:\s*(\d{4}-\d{2}-\d{2})/i);
        if (dateMatch) {
            task.dueDate = dateMatch[1];
            workingLine = workingLine.replace(/\s*-?\s*Due:\s*\d{4}-\d{2}-\d{2}/i, '');
        }

        // Extract and remove time
        const timeMatch = workingLine.match(/Time:\s*(\d{1,2}):(\d{2})/i);
        if (timeMatch) {
            task.deadlineTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
            task.hasDeadline = true;
            workingLine = workingLine.replace(/\s*-?\s*Time:\s*\d{1,2}:\d{2}/i, '');
            console.log('Set deadline time:', task.deadlineTime, 'hasDeadline:', task.hasDeadline);
        }

        // Extract and remove priority
        const priorityMatch = workingLine.match(/Priority:\s*(High|Medium|Low)/i);
        if (priorityMatch) {
            task.priority = priorityMatch[1].toLowerCase();
            workingLine = workingLine.replace(/\s*-?\s*Priority:\s*(?:High|Medium|Low)/i, '');
        }

        // Clean up the remaining text as the title
        task.title = workingLine
            .replace(/^\s*-\s*/, '') // Remove leading dash
            .replace(/\s*-\s*$/, '') // Remove trailing dash
            .replace(/\s+/g, ' ')    // Normalize spaces
            .trim();

        console.log('Extracted task:', task);

        // Only add if we have a reasonable title
        if (task.title.length >= 3) {
            // If we have a deadline time but no due date, set today's date
            if (task.hasDeadline && task.deadlineTime && !task.dueDate) {
                const today = new Date();
                task.dueDate = today.toISOString().split('T')[0];
                console.log('Added today\'s date for task with time:', task.dueDate);
            }
            
            tasks.push(task);
        }
    }

    console.log('Final tasks:', tasks);
    return tasks;
}

function updateAddButton() {
    const btn = document.getElementById('addTaskBtn');
    const title = document.getElementById('taskTitle').value.trim();
    
    if (selectedPdfFile && title) {
        btn.textContent = `Add Task & Extract from PDF`;
        btn.classList.add('pdf-mode');
    } else if (selectedPdfFile) {
        btn.textContent = `Extract Tasks from PDF`;
        btn.classList.add('pdf-mode');
    } else if (title) {
        btn.textContent = 'Add Task';
        btn.classList.remove('pdf-mode');
    } else {
        btn.textContent = 'Add Task';
        btn.classList.remove('pdf-mode');
    }
}