// src/App.tsx
import LandingPage from './pages/landing/LandingPage';
import './App.css';
import SiteHeader from './components/SiteHeader';
import LoadingScreen from './components/LoadingScreen';

function App() {
    return (
        <>
            <LoadingScreen />
            <div className="app-container">
                <SiteHeader />
                <LandingPage />
            </div>
        </>
    );
}

export default App;
