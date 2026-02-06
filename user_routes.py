# User Management API Endpoints (Admin Only)

@app.route('/api/users', methods=['GET'])
@admin_required
def get_users():
    """Get all users (admin only)"""
    conn = get_db_connection()
    users = conn.execute('SELECT id, username, full_name, email, role, created_at, is_active FROM users ORDER BY created_at DESC').fetchall()
    conn.close()
    
    return jsonify({
        'success': True,
        'users': [dict(user) for user in users]
    })

@app.route('/api/users', methods=['POST'])
@admin_required
def create_user():
    """Create new user (admin only)"""
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')
    full_name = data.get('full_name', '').strip()
    email = data.get('email', '').strip()
    role = data.get('role', 'staff')
    
    if not username or not password:
        return jsonify({'success': False, 'error': 'Username and password required'}), 400
    
    if role not in ['admin', 'manager', 'staff']:
        return jsonify({'success': False, 'error': 'Invalid role'}), 400
    
    conn = get_db_connection()
    try:
        password_hash = generate_password_hash(password)
        created_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        conn.execute("""INSERT INTO users (username, password_hash, full_name, email, role, created_at, is_active)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (username, password_hash, full_name, email, role, created_at, 1))
        conn.commit()
        
        user_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.close()
        
        return jsonify({
            'success': True,
            'message': 'User created successfully',
            'user_id': user_id
        })
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'success': False, 'error': 'Username already exists'}), 400
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    """Update user details (admin only)"""
    data = request.json
    full_name = data.get('full_name')
    email = data.get('email')
    role = data.get('role')
    
    if role and role not in ['admin', 'manager', 'staff']:
        return jsonify({'success': False, 'error': 'Invalid role'}), 400
    
    conn = get_db_connection()
    try:
        updates = []
        params = []
        
        if full_name is not None:
            updates.append('full_name = ?')
            params.append(full_name)
        if email is not None:
            updates.append('email = ?')
            params.append(email)
        if role is not None:
            updates.append('role = ?')
            params.append(role)
        
        if not updates:
            conn.close()
            return jsonify({'success': False, 'error': 'No fields to update'}), 400
        
        params.append(user_id)
        query = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
        conn.execute(query, params)
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'User updated successfully'})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/users/<int:user_id>/toggle-active', methods=['POST'])
@admin_required
def toggle_user_active(user_id):
    """Enable/disable user account (admin only)"""
    # Prevent deactivating yourself
    if user_id == session.get('user_id'):
        return jsonify({'success': False, 'error': 'Cannot deactivate your own account'}), 400
    
    conn = get_db_connection()
    try:
        user = conn.execute('SELECT is_active FROM users WHERE id = ?', (user_id,)).fetchone()
        if not user:
            conn.close()
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        new_status = 0 if user['is_active'] else 1
        conn.execute('UPDATE users SET is_active = ? WHERE id = ?', (new_status, user_id))
        conn.commit()
        conn.close()
        
        status_text = 'activated' if new_status else 'deactivated'
        return jsonify({'success': True, 'message': f'User {status_text} successfully'})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/users/<int:user_id>/change-password', methods=['POST'])
@login_required
def change_password(user_id):
    """Change user password"""
    data = request.json
    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')
    
    # Users can only change their own password, unless they're admin
    if user_id != session.get('user_id'):
        conn = get_db_connection()
        user = conn.execute('SELECT role FROM users WHERE id = ?', (session['user_id'],)).fetchone()
        conn.close()
        if not user or user['role'] != 'admin':
            return jsonify({'success': False, 'error': 'Unauthorized'}), 403
    
    if not new_password or len(new_password) < 6:
        return jsonify({'success': False, 'error': 'Password must be at least 6 characters'}), 400
    
    conn = get_db_connection()
    try:
        user = conn.execute('SELECT password_hash FROM users WHERE id = ?', (user_id,)).fetchone()
        if not user:
            conn.close()
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        # Verify current password if changing own password
        if user_id == session.get('user_id'):
            if not current_password or not check_password_hash(user['password_hash'], current_password):
                conn.close()
                return jsonify({'success': False, 'error': 'Current password is incorrect'}), 401
        
        new_hash = generate_password_hash(new_password)
        conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', (new_hash, user_id))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Password changed successfully'})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """Delete user (admin only)"""
    # Prevent deleting yourself
    if user_id == session.get('user_id'):
        return jsonify({'success': False, 'error': 'Cannot delete your own account'}), 400
    
    conn = get_db_connection()
    try:
        conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'User deleted successfully'})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 500
