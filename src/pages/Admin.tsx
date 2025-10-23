import { useState, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, AlertCircle, TrendingUp, Users, Mail, Phone, UserX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UserWithProfile {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: string;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
}

const Admin = () => {
  const [stats, setStats] = useState({
    totalReports: 0,
    activeEmergencies: 0,
    resolvedToday: 0,
    averageResponseTime: 'N/A',
  });
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [users, setUsers] = useState<UserWithProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserWithProfile | null>(null);
  const [userContacts, setUserContacts] = useState<Contact[]>([]);
  const [showContactsDialog, setShowContactsDialog] = useState(false);
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!user || userRole !== 'admin') {
      navigate('/auth');
      return;
    }

    fetchStats();
    fetchHeatmapData();
    fetchUsers();

    const channel = supabase
      .channel('admin-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'emergency_reports',
        },
        () => {
          fetchStats();
          fetchHeatmapData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, userRole, navigate]);

  const fetchStats = async () => {
    const { data: reports } = await supabase
      .from('emergency_reports')
      .select('*');

    if (reports) {
      const today = new Date().toDateString();
      const resolvedToday = reports.filter(
        r => r.status === 'resolved' && new Date(r.resolved_at || '').toDateString() === today
      ).length;

      setStats({
        totalReports: reports.length,
        activeEmergencies: reports.filter(r => r.status !== 'resolved' && r.status !== 'cancelled').length,
        resolvedToday,
        averageResponseTime: 'Calculating...',
      });
    }
  };

  const fetchHeatmapData = async () => {
    const { data } = await supabase
      .from('emergency_reports')
      .select('latitude, longitude, emergency_type, created_at')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    if (data) {
      setHeatmapData(data);
    }
  };

  const fetchUsers = async () => {
    try {
      // Fetch profiles with user roles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone');

      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (profiles && roles) {
        const usersData = profiles.map(profile => {
          const userRole = roles.find(r => r.user_id === profile.id);
          return {
            id: profile.id,
            email: profile.id.substring(0, 8) + '...', // Show partial ID as placeholder
            full_name: profile.full_name || 'N/A',
            phone: profile.phone || 'N/A',
            role: userRole?.role || 'citizen',
          };
        });
        setUsers(usersData);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchUserContacts = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;
      setUserContacts(data || []);
    } catch (error) {
      console.error('Error fetching contacts:', error);
      toast({
        title: 'Error',
        description: 'Failed to load user contacts',
        variant: 'destructive',
      });
    }
  };

  const handleViewContacts = (user: UserWithProfile) => {
    setSelectedUser(user);
    fetchUserContacts(user.id);
    setShowContactsDialog(true);
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'medical': return 'bg-primary';
      case 'fire': return 'bg-destructive';
      case 'crime': return 'bg-accent';
      case 'accident': return 'bg-accent';
      default: return 'bg-muted';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="max-w-7xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
            <p className="text-muted-foreground">
              System overview and safety analytics
            </p>
          </div>

          {/* Statistics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalReports}</div>
                <p className="text-xs text-muted-foreground">All time</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Emergencies</CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">{stats.activeEmergencies}</div>
                <p className="text-xs text-muted-foreground">Currently active</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Resolved Today</CardTitle>
                <Users className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-success">{stats.resolvedToday}</div>
                <p className="text-xs text-muted-foreground">Last 24 hours</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Response</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.averageResponseTime}</div>
                <p className="text-xs text-muted-foreground">Minutes</p>
              </CardContent>
            </Card>
          </div>

          {/* Safety Heatmap */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Safety Heatmap (Last 7 Days)
              </CardTitle>
              <CardDescription>
                Visual representation of emergency hotspots in your area
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-muted rounded-lg p-8 text-center">
                  <MapPin className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Interactive map visualization would be displayed here
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {heatmapData.length} emergency reports in the past 7 days
                  </p>
                </div>

                {/* Emergency Type Breakdown */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {['medical', 'fire', 'crime', 'accident', 'disaster', 'other'].map(type => {
                    const count = heatmapData.filter(d => d.emergency_type === type).length;
                    return (
                      <div key={type} className="text-center p-4 border rounded-lg">
                        <div className={`w-12 h-12 ${getTypeColor(type)} rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold`}>
                          {count}
                        </div>
                        <p className="text-sm font-medium capitalize">{type}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Recent Locations */}
                <div className="space-y-2">
                  <h4 className="font-semibold">Recent Emergency Locations</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {heatmapData.slice(0, 10).map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-2 border rounded text-sm">
                        <span className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                        </span>
                        <span className="capitalize text-muted-foreground">
                          {item.emergency_type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Users Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Registered Users
              </CardTitle>
              <CardDescription>
                Manage users and view their emergency contacts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {users.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No users found</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {users.map((userData) => (
                      <div
                        key={userData.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1">
                          <h4 className="font-semibold">{userData.full_name}</h4>
                          <div className="flex flex-col gap-1 text-sm text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {userData.email}
                            </span>
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {userData.phone}
                            </span>
                          </div>
                          <span className="inline-block mt-2 px-2 py-1 text-xs rounded-full bg-primary/10 text-primary capitalize">
                            {userData.role}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewContacts(userData)}
                        >
                          View Contacts
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Contacts Dialog */}
      <Dialog open={showContactsDialog} onOpenChange={setShowContactsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Emergency Contacts for {selectedUser?.full_name}
            </DialogTitle>
            <DialogDescription>
              View the emergency contacts saved by this user
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {userContacts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <UserX className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No emergency contacts found for this user</p>
              </div>
            ) : (
              <div className="space-y-3">
                {userContacts.map((contact) => (
                  <Card key={contact.id}>
                    <CardContent className="pt-6">
                      <h4 className="font-semibold text-lg mb-2">{contact.name}</h4>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4" />
                          <span>{contact.phone}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          <span>{contact.email}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;