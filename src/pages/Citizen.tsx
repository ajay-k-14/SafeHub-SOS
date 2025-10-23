import { useState, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, MapPin, Clock, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const Citizen = () => {
  const [emergencyType, setEmergencyType] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [myReports, setMyReports] = useState<any[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    // Get user's location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          console.error('Error getting location:', error);
          toast({
            title: 'Location Error',
            description: 'Unable to get your location. Please enable location services.',
            variant: 'destructive',
          });
        }
      );
    }

    // Fetch user's reports
    fetchMyReports();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('emergency-reports-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'emergency_reports',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchMyReports();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, navigate]);

  const fetchMyReports = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('emergency_reports')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Error fetching reports:', error);
    } else {
      setMyReports(data || []);
    }
  };

  const handleSOS = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!location) {
      toast({
        title: 'Location Required',
        description: 'Please enable location services to send an SOS.',
        variant: 'destructive',
      });
      return;
    }

    if (!emergencyType) {
      toast({
        title: 'Emergency Type Required',
        description: 'Please select the type of emergency.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      // Get user's profile for name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user?.id)
        .single();

      const { data, error } = await supabase.from('emergency_reports').insert([{
        user_id: user?.id,
        emergency_type: emergencyType as any,
        description: description || null,
        latitude: location.latitude,
        longitude: location.longitude,
        status: 'pending' as any,
      }]).select().single();

      if (error) throw error;

      // Notify user's emergency contacts
      try {
        await supabase.functions.invoke('notify-contacts', {
          body: {
            emergency_id: data.id,
            emergency_type: emergencyType,
            latitude: location.latitude,
            longitude: location.longitude,
            description,
            user_id: user?.id,
            reporter_name: profile?.full_name || 'User',
          },
        });
      } catch (notifyError) {
        console.error('Error notifying contacts:', notifyError);
        // Don't fail the whole operation if contact notification fails
      }

      toast({
        title: 'SOS Sent!',
        description: 'Emergency responders and your contacts have been notified.',
      });

      setEmergencyType('');
      setDescription('');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'text-accent';
      case 'acknowledged':
        return 'text-secondary';
      case 'responding':
        return 'text-primary';
      case 'resolved':
        return 'text-success';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* SOS Card */}
          <Card className="border-primary shadow-emergency">
            <CardHeader>
              <CardTitle className="text-2xl flex items-center gap-2">
                <AlertCircle className="w-6 h-6 text-primary" />
                Send Emergency SOS
              </CardTitle>
              <CardDescription>
                Quick access to emergency services. Your location will be shared automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSOS} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="emergencyType">Emergency Type *</Label>
                  <Select value={emergencyType} onValueChange={setEmergencyType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select emergency type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="medical">Medical Emergency</SelectItem>
                      <SelectItem value="fire">Fire</SelectItem>
                      <SelectItem value="crime">Crime in Progress</SelectItem>
                      <SelectItem value="accident">Accident</SelectItem>
                      <SelectItem value="disaster">Natural Disaster</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Provide additional details about the emergency..."
                    rows={3}
                  />
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  <span>
                    {location
                      ? `Location: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
                      : 'Getting location...'}
                  </span>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full text-lg"
                  disabled={loading || !location}
                >
                  {loading ? 'Sending SOS...' : 'Send SOS Alert'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Recent Reports */}
          <Card>
            <CardHeader>
              <CardTitle>My Recent Reports</CardTitle>
              <CardDescription>Track the status of your emergency reports</CardDescription>
            </CardHeader>
            <CardContent>
              {myReports.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No reports yet. Use the SOS button above in case of emergency.
                </p>
              ) : (
                <div className="space-y-4">
                  {myReports.map((report) => (
                    <div
                      key={report.id}
                      className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <AlertCircle className={`w-5 h-5 mt-1 ${getStatusColor(report.status)}`} />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold capitalize">
                            {report.emergency_type.replace('_', ' ')}
                          </h4>
                          <span className={`text-sm font-medium capitalize ${getStatusColor(report.status)}`}>
                            {report.status}
                          </span>
                        </div>
                        {report.description && (
                          <p className="text-sm text-muted-foreground">{report.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(report.created_at).toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {report.latitude.toFixed(4)}, {report.longitude.toFixed(4)}
                          </span>
                        </div>
                      </div>
                      {report.status === 'resolved' && (
                        <CheckCircle className="w-5 h-5 text-success" />
                      )}
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

export default Citizen;