// ============================================================
//                     ЗАГРУЗКА БИБЛИОТЕК
// ============================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const app = express();

// Разрешаем запросы с фронта и парсим JSON в теле запроса
app.use(cors());
app.use(express.json());

// Секретный ключ для подписи токенов. В продакшене — вынести в .env
const JWT_SECRET = 'lapa-pomoshi-secret-key-2026';

// ============================================================
//                        ЖИВОТНЫЕ
// ============================================================

/* Список всех животных. Свежие записи идут первыми */
app.get('/api/animals', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM animals ORDER BY id DESC');
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* Одно животное по id. Если не найдено — 404 */
app.get('/api/animals/:id', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM animals WHERE id = $1', [req.params.id]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Не найдено' });
        res.json(r.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* Добавление нового животного из админки */
/* Добавление нового животного из админки */
/* Добавление нового животного из админки */
app.post('/api/animals', async (req, res) => {
    try {
        const { name, species, breed, gender, age, size, img, tags, description } = req.body;

        if (!name || !species) {
            return res.status(400).json({ error: 'Укажите имя и вид' });
        }

        const r = await pool.query(
            `INSERT INTO animals (name, species, breed, gender, age, size, img, tags, description)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [name, species, breed || null, gender, age, size, img, tags, description]
        );
        res.json(r.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* Изменение животного по id */
/* Изменение животного по id */
app.put('/api/animals/:id', async (req, res) => {
    try {
        const { name, species, breed, gender, age, size, img, description } = req.body;
        const r = await pool.query(
            `UPDATE animals SET name=$1, species=$2, breed=$3, gender=$4, age=$5, size=$6, img=$7, description=$8
             WHERE id=$9 RETURNING *`,
            [name, species, breed || null, gender, age, size, img, description, req.params.id]
        );
        res.json(r.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* Удаление животного по id */
app.delete('/api/animals/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM animals WHERE id = $1', [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
//                        ЗАЯВКИ
// ============================================================

/* Все заявки с именем питомца. Используется в админке */
app.get('/api/applications', async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT a.*, an.name AS pet_name
            FROM applications a
            LEFT JOIN animals an ON a.animal_id = an.id
            ORDER BY a.created_at DESC
        `);
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* Заявки конкретного пользователя. Используется в личном кабинете */
app.get('/api/applications/user/:userId', async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT a.*, an.name AS pet_name, an.img AS pet_img
            FROM applications a
            LEFT JOIN animals an ON a.animal_id = an.id
            WHERE a.user_id = $1
            ORDER BY a.created_at DESC
        `, [req.params.userId]);
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* Создание новой заявки на усыновление */
app.post('/api/applications', async (req, res) => {
    try {
        const {
            animal_id, user_id, name, email, phone,
            message, housing_type, has_other_pets, has_children
        } = req.body;

        if (!animal_id || !name || !email) {
            return res.status(400).json({ error: 'Заполните обязательные поля' });
        }

        const r = await pool.query(
            `INSERT INTO applications
                (animal_id, user_id, user_name, email, phone, message,
                 housing_type, has_other_pets, has_children)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [
                animal_id,
                user_id || null,
                name,
                email,
                phone,
                message,
                housing_type || null,
                has_other_pets || false,
                has_children || false
            ]
        );
        res.json(r.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* Изменение статуса заявки — одобрить / отклонить */
app.put('/api/applications/:id', async (req, res) => {
    try {
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ error: 'Не указан статус' });
        }

        const r = await pool.query(
            `UPDATE applications
             SET status = $1, reviewed_at = NOW()
             WHERE id = $2 RETURNING *`,
            [status, req.params.id]
        );
        res.json(r.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* Удаление заявки по id */
app.delete('/api/applications/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM applications WHERE id = $1', [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
//                    АВТОРИЗАЦИЯ
// ============================================================

/* Регистрация нового пользователя с ролью user */
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Все поля обязательны' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Пароль минимум 6 символов' });
        }

        // Проверяем, что email ещё не занят
        const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (exists.rows.length > 0) {
            return res.status(400).json({ error: 'Email уже используется' });
        }

        // Хешируем пароль перед сохранением
        const password_hash = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO users (full_name, email, phone, password_hash, role)
             VALUES ($1, $2, $3, $4, 'user')
             RETURNING id, full_name, email, phone, role`,
            [name, email, phone || null, password_hash]
        );

        const user = result.rows[0];
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ token, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* Вход по email и паролю */
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Укажите email и пароль' });
        }

        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Пользователь с таким email не найден' });
        }

        const user = result.rows[0];
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                full_name: user.full_name,
                email: user.email,
                phone: user.phone,
                role: user.role
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
//                        КОНТАКТЫ
// ============================================================

/* Сохранение сообщения с формы обратной связи */
app.post('/api/contacts', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Заполните все обязательные поля' });
        }

        const result = await pool.query(
            `INSERT INTO contacts (name, email, subject, message)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [name, email, subject || null, message]
        );

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* Все сообщения — для админки */
app.get('/api/contacts', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM contacts ORDER BY created_at DESC');
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
//                          СТАРТ
// ============================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Сервер запущен на порту ${PORT}`));
