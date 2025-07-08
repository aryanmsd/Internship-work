const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
mongoose.connect('mongodb://localhost:27017/database', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));
const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    }
}, {
    timestamps: true
});

const User = mongoose.model('User', userSchema);
const taskSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    dueDate: {
        type: Date,
        default: null
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    completed: {
        type: Boolean,
        default: false
    },
    hasDeadline: {
        type: Boolean,
        default: false
    },
    deadlineTime: {
        type: String, 
        default: null
    }
}, {
    timestamps: true
});

const Task = mongoose.model('Task', taskSchema);
const userSessions = new Map(); 
function ensureUserSession(userId, username, email) {
    if (!userSessions.has(userId)) {
        userSessions.set(userId, {
            username: username || email.split('@')[0]
        });
    }
    return userSessions.get(userId);
}
app.post('/api/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists with this email' });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const user = new User({
            email,
            password: hashedPassword
        });

        await user.save();
        console.log('New user created:', user._id);
        ensureUserSession(user._id.toString(), username, email);

        res.status(201).json({ 
            message: 'User created successfully',
            user: {
                id: user._id,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Server error during signup' });
    }
});

app.post('/api/signin', async (req, res) => {
    try {
        const { email, password, username } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        const userId = user._id.toString();
        ensureUserSession(userId, username, email);
        const sessionData = userSessions.get(userId);

        const tasks = await Task.find({ userId: user._id }).sort({ createdAt: -1 });
        console.log(`User ${userId} logged in, found ${tasks.length} tasks`);

        res.json({ 
            message: 'Login successful',
            user: {
                id: user._id,
                username: sessionData.username,
                email: user.email,
                tasks: tasks
            }
        });
    } catch (error) {
        console.error('Signin error:', error);
        res.status(500).json({ error: 'Server error during signin' });
    }
});

app.get('/api/tasks/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: 'Invalid user ID format' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        ensureUserSession(userId, null, user.email);
        
        const tasks = await Task.find({ userId }).sort({ createdAt: -1 });
        console.log(`Retrieved ${tasks.length} tasks for user ${userId}`);
        
        res.json({ tasks: tasks });
    } catch (error) {
        console.error('Get tasks error:', error);
        res.status(500).json({ error: 'Server error getting tasks' });
    }
});

app.post('/api/tasks/:userId', async (req, res) => {
    try {
        const { title, dueDate, priority, hasDeadline, deadlineTime } = req.body;
        const userId = req.params.userId;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: 'Invalid user ID format' });
        }

        if (!title || title.trim().length === 0) {
            return res.status(400).json({ error: 'Task title is required' });
        }
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        ensureUserSession(userId, null, user.email);
        const newTask = new Task({
            userId,
            title: title.trim(),
            dueDate: dueDate ? new Date(dueDate) : null,
            priority: priority || 'medium',
            hasDeadline: hasDeadline || false,
            deadlineTime: deadlineTime || null,
            completed: false
        });

        await newTask.save();
        console.log('New task created:', newTask._id, 'for user:', userId);

        res.status(201).json({ 
            message: 'Task added successfully', 
            task: newTask 
        });
    } catch (error) {
        console.error('Add task error:', error);
        res.status(500).json({ error: 'Server error adding task' });
    }
});

app.put('/api/tasks/:userId/:taskId', async (req, res) => {
    try {
        const { userId, taskId } = req.params;
        const { action } = req.body; 

        if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(taskId)) {
            return res.status(400).json({ error: 'Invalid ID format' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        ensureUserSession(userId, null, user.email);

        if (action === 'toggle') {
            const task = await Task.findOne({ _id: taskId, userId });
            if (!task) {
                return res.status(404).json({ error: 'Task not found' });
            }
            
            task.completed = !task.completed;
            await task.save();
            console.log(`Task ${taskId} toggled to ${task.completed ? 'completed' : 'incomplete'}`);
            
            res.json({ 
                message: 'Task updated successfully',
                task: task
            });
        } else if (action === 'delete') {
            const result = await Task.deleteOne({ _id: taskId, userId });
            if (result.deletedCount === 0) {
                return res.status(404).json({ error: 'Task not found' });
            }
            
            console.log(`Task ${taskId} deleted for user ${userId}`);
            res.json({ message: 'Task deleted successfully' });
        } else {
            res.status(400).json({ error: 'Invalid action. Use "toggle" or "delete"' });
        }
    } catch (error) {
        console.error('Update task error:', error);
        res.status(500).json({ error: 'Server error updating task' });
    }
});

app.post('/api/logout/:userId', (req, res) => {
    try {
        const userId = req.params.userId;
        userSessions.delete(userId);
        console.log(`User ${userId} logged out`);
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Server error during logout' });
    }
});

app.get('/api/debug/tasks', async (req, res) => {
    try {
        const allTasks = await Task.find().populate('userId', 'email');
        const allUsers = await User.find({}, { password: 0 }); 
        res.json({
            totalTasks: allTasks.length,
            totalUsers: allUsers.length,
            tasks: allTasks,
            users: allUsers,
            sessions: Array.from(userSessions.entries())
        });
    } catch (error) {
        console.error('Debug error:', error);
        res.status(500).json({ error: 'Debug error' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/todo', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'todo.html'));
});
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://192.168.29.93:${PORT}`);
    console.log(`Frontend accessible at http://192.168.29.93:5500`);
    console.log('Tasks are stored in MongoDB database');
    console.log('Debug endpoint: /api/debug/tasks');
});