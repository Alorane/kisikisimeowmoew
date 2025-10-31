-- Database schema for repairs management system
-- This script creates tables with proper relationships

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create device_types table
CREATE TABLE device_types (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups on device_types
CREATE INDEX idx_device_types_sort_order ON device_types(sort_order);

-- Create devices table (specific device models like iPhone 14, iPhone 15, etc.)
CREATE TABLE devices (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name TEXT NOT NULL UNIQUE, -- e.g. 'iPhone 14', 'iPhone 14 Pro', 'MacBook Pro 16"'
    device_type_id BIGINT NOT NULL REFERENCES device_types(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups on devices
CREATE INDEX idx_devices_device_type_id ON devices(device_type_id);
CREATE INDEX idx_devices_name ON devices(name);

-- Create repairs table (services offered for specific devices)
CREATE TABLE repairs (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    title TEXT NOT NULL, -- e.g. 'Замена экрана', 'Замена аккумулятора'
    price NUMERIC NOT NULL CHECK (price >= 0),
    description TEXT, -- renamed from 'desc' to avoid reserved word
    warranty TEXT, -- renamed from 'waranty' for consistency
    work_time TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(device_id, title) -- ensure no duplicate services per device
);

-- Create index for faster lookups on repairs
CREATE INDEX idx_repairs_device_id ON repairs(device_id);
CREATE INDEX idx_repairs_title ON repairs(title);

-- Create orders table (customer repair requests)
CREATE TABLE orders (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    ts TIMESTAMPTZ DEFAULT NOW(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    device_id BIGINT REFERENCES devices(id) ON DELETE SET NULL, -- link to specific device if known
    issue TEXT NOT NULL,
    price NUMERIC NOT NULL CHECK (price >= 0),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups on orders
CREATE INDEX idx_orders_device_id ON orders(device_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- Create notification_chats table (Telegram chats for notifications)
CREATE TABLE notification_chats (
    chat_id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_device_types_updated_at BEFORE UPDATE ON device_types FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_repairs_updated_at BEFORE UPDATE ON repairs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_chats_updated_at BEFORE UPDATE ON notification_chats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
