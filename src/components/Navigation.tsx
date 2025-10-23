import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Shield, LogOut, Home, Activity, Map, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export const Navigation = () => {
  const { user, userRole, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (!user) return null;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card border-b border-border">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-xl">
          <Shield className="w-6 h-6 text-primary" />
          <span>SafeHub</span>
        </Link>
        
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <Home className="w-4 h-4 mr-2" />
              Home
            </Button>
          </Link>
          
          {userRole === 'citizen' && (
            <>
              <Link to="/dashboard">
                <Button variant="ghost" size="sm">
                  <Activity className="w-4 h-4 mr-2" />
                  Contacts
                </Button>
              </Link>
              <Link to="/citizen">
                <Button variant="ghost" size="sm">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Send SOS
                </Button>
              </Link>
            </>
          )}
          
          {(userRole === 'responder' || userRole === 'admin') && (
            <Link to="/responder">
              <Button variant="ghost" size="sm">
                <Activity className="w-4 h-4 mr-2" />
                Responder
              </Button>
            </Link>
          )}
          
          {userRole === 'admin' && (
            <Link to="/admin">
              <Button variant="ghost" size="sm">
                <Map className="w-4 h-4 mr-2" />
                Admin
              </Button>
            </Link>
          )}
          
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    </nav>
  );
};