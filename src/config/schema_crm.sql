CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    password TEXT,
    role VARCHAR(20) DEFAULT 'client'
);

CREATE TABLE cars (
    id SERIAL PRIMARY KEY,
    brand VARCHAR(50),
    model VARCHAR(50),
    price_per_day NUMERIC,
    available BOOLEAN DEFAULT true
);

CREATE TABLE rentals (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    car_id INT REFERENCES cars(id),
    start_date DATE,
    end_date DATE,
    total_price NUMERIC,
    status VARCHAR(20) DEFAULT 'confirmed'
);

CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    car_id INT REFERENCES cars(id),
    rating INT CHECK (rating >= 1 AND rating <= 10),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_review UNIQUE (user_id, car_id)
);
