// src/pages/login/Login.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../stores/useAuthStore'; // Importar el store de autenticación

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { setUser, setAlternateUser } = useAuthStore(); // Traemos las funciones para actualizar los usuarios

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false); // Variable para gestionar el estado de inicio de sesión

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulando la autenticación de los usuarios con correo y contraseña

    // Primer usuario (usuario 1)
    const user1 = {
      email: 'john.doe@gmail.com',
      password: '12345',
      displayName: 'John Doe',
      photoURL: 'photo.com',
    };

    // Segundo usuario (usuario 2)
    const user2 = {
      email: 'jane.smith@gmail.com',
      password: '67890',
      displayName: 'Jane Smith',
      photoURL: 'photo2.com',
    };

    // Validamos el correo y la contraseña ingresados
    if (email === user1.email && password === user1.password) {
      setUser(user1); // Guardamos el primer usuario
      setIsLoggedIn(true); // Indicamos que el inicio de sesión fue exitoso
      navigate('/profile'); // Redirigimos al perfil después del login
    } else if (email === user2.email && password === user2.password) {
      setUser(user2); // Actualizamos el estado para el segundo usuario
      setAlternateUser(null); // Limpiamos el usuario alternativo, ya que este es el principal
      setIsLoggedIn(true); // Indicamos que el inicio de sesión fue exitoso
      navigate('/profile'); // Redirigimos al perfil después del login
    } else {
      alert('Correo o contraseña incorrectos.'); // Si no se validan las credenciales
    }
  };

  return (
    <div className="container-page">
      <div>
        <h1>Iniciar Sesión</h1>
        <form onSubmit={handleLogin}>
          <div>
            <label htmlFor="email">Correo electrónico</label>
            <input
              type="email"
              id="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="password">Contraseña</label>
            <input
              type="password"
              id="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit">Iniciar sesión</button>
        </form>
      </div>
    </div>
  );
};

export default Login;
