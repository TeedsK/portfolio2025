// src/App.tsx
import LandingPage from './pages/landing/LandingPage';
import './App.css';
import SiteHeader from './components/SiteHeader';

function App() {
    return (
        <div className="app-container">
            <SiteHeader />
            <LandingPage />
        </div>
    );
}

export default App;
