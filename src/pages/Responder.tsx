import { useState, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, MapPin, Clock, CheckCircle, Navigation as NavigationIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const Responder = () => {
  const [emergencies, setEmergencies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user, userRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || (userRole !== 'responder' && userRole !== 'admin')) {
      navigate('/auth');
      return;
    }

    fetchEmergencies();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('emergency-reports-responder')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'emergency_reports',
        },
        () => {
          fetchEmergencies();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, userRole, navigate]);

  const fetchEmergencies = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('emergency_reports')
      .select('*, profiles(full_name, phone)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching emergencies:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch emergency reports.',
        variant: 'destructive',
      });
    } else {
      setEmergencies(data || []);
    }
    setLoading(false);
  };

  const updateStatus = async (reportId: string, newStatus: string) => {
    const { error } = await supabase
      .from('emergency_reports')
      .update({ 
        status: newStatus as any,
        responder_id: newStatus === 'acknowledged' ? user?.id : undefined,
        resolved_at: newStatus === 'resolved' ? new Date().toISOString() : undefined,
      })
      .eq('id', reportId);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to update status.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Status Updated',
        description: `Emergency status changed to ${newStatus}.`,
      });
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'pending':
        return 'destructive';
      case 'acknowledged':
        return 'secondary';
      case 'responding':
        return 'default';
      case 'resolved':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getEmergencyColor = (type: string) => {
    switch (type) {
      case 'medical':
        return 'text-primary';
      case 'fire':
        return 'text-destructive';
      case 'crime':
        return 'text-accent';
      case 'accident':
        return 'text-accent';
      default:
        return 'text-muted-foreground';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto px-4 pt-24 text-center">
          <p>Loading emergencies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="max-w-6xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Emergency Response Dashboard</h1>
            <p className="text-muted-foreground">
              Monitor and respond to emergency reports in real-time
            </p>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-primary">
                  {emergencies.filter(e => e.status === 'pending').length}
                </div>
                <p className="text-sm text-muted-foreground">Pending</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-secondary">
                  {emergencies.filter(e => e.status === 'acknowledged').length}
                </div>
                <p className="text-sm text-muted-foreground">Acknowledged</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-accent">
                  {emergencies.filter(e => e.status === 'responding').length}
                </div>
                <p className="text-sm text-muted-foreground">Responding</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-success">
                  {emergencies.filter(e => e.status === 'resolved').length}
                </div>
                <p className="text-sm text-muted-foreground">Resolved</p>
              </CardContent>
            </Card>
          </div>

          {/* Emergency Reports */}
          <Card>
            <CardHeader>
              <CardTitle>Active Emergency Reports</CardTitle>
              <CardDescription>Manage and respond to incoming emergencies</CardDescription>
            </CardHeader>
            <CardContent>
              {emergencies.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No emergency reports at this time.
                </p>
              ) : (
                <div className="space-y-4">
                  {emergencies.map((emergency) => (
                    <div
                      key={emergency.id}
                      className="p-6 border rounded-lg space-y-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1">
                          <AlertCircle className={`w-6 h-6 mt-1 ${getEmergencyColor(emergency.emergency_type)}`} />
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-lg capitalize">
                                {emergency.emergency_type.replace('_', ' ')} Emergency
                              </h3>
                              <Badge variant={getStatusBadgeVariant(emergency.status)}>
                                {emergency.status}
                              </Badge>
                            </div>
                            
                            {emergency.description && (
                              <p className="text-muted-foreground">{emergency.description}</p>
                            )}

                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {new Date(emergency.created_at).toLocaleString()}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" />
                                {emergency.latitude.toFixed(4)}, {emergency.longitude.toFixed(4)}
                              </span>
                            </div>

                            {emergency.profiles && (
                              <div className="text-sm">
                                <span className="font-medium">Reporter:</span>{' '}
                                {emergency.profiles.full_name || 'Unknown'} 
                                {emergency.profiles.phone && ` (${emergency.profiles.phone})`}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(`https://www.google.com/maps?q=${emergency.latitude},${emergency.longitude}`, '_blank')}
                        >
                          <NavigationIcon className="w-4 h-4 mr-2" />
                          Navigate
                        </Button>
                        
                        {emergency.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => updateStatus(emergency.id, 'acknowledged')}
                          >
                            Acknowledge
                          </Button>
                        )}
                        
                        {emergency.status === 'acknowledged' && (
                          <Button
                            size="sm"
                            onClick={() => updateStatus(emergency.id, 'responding')}
                          >
                            Start Responding
                          </Button>
                        )}
                        
                        {emergency.status === 'responding' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-success text-success hover:bg-success hover:text-success-foreground"
                            onClick={() => updateStatus(emergency.id, 'resolved')}
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Mark Resolved
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Responder;