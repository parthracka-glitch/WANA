import React, {
  useEffect,
  useState,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import { REGION_CENTERS } from "../../constants/regionCenters";

// Add global styles for Mappls InfoWindow
const infoWindowStyles = `
  .mappls-infowindow,
  .mmi-infowindow,
  .mappls-popup,
  .mmi-popup {
    z-index: 9999 !important;
    position: absolute !important;
  }
  
  .mappls-infowindow-content,
  .mmi-infowindow-content {
    background: white !important;
    border-radius: 8px !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
    max-width: 400px !important;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = infoWindowStyles;
  document.head.appendChild(styleSheet);
}

const INDIA_CENTER = { lat: 20.5937, lng: 78.9629 };

const Map = forwardRef(({ alerts = [], acceptors = [], region }, ref) => {
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const acceptorMarkersRef = useRef({});
  const currentInfoWindowRef = useRef(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  // Helper function to count acceptors for an event
  const getAcceptorCount = (eventId) => {
    return acceptors.filter(a => a.eventId === eventId).length;
  };

  // Helper to close previous info window
  const closeCurrentInfoWindow = () => {
    if (currentInfoWindowRef.current) {
      try {
        currentInfoWindowRef.current.close();
      } catch (e) {
        console.log("Could not close previous window");
      }
    }
  };

  // 🔁 Allow dashboard to focus on SOS
  useImperativeHandle(ref, () => ({
    focusLocation(lat, lng) {
      if (!mapRef.current || !isMapLoaded) return;
      mapRef.current.setCenter([lng, lat]);
      mapRef.current.setZoom(16);
    },
  }));

  // 🗺️ INITIALIZE MAP ONLY ONCE
  useEffect(() => {
    if (!window.mappls || mapRef.current) return;

    mapRef.current = new window.mappls.Map("map", {
      center: [INDIA_CENTER.lng, INDIA_CENTER.lat],
      zoom: 5,
      zoomControl: true,
      mapStyle: "standard_day",
    });

    mapRef.current.on("load", () => {
      setIsMapLoaded(true);
    });
  }, []);

  // 🎯 CENTER MAP BASED ON SUPERVISOR REGION
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current || !region) return;

    const key = region.toLowerCase();
    const center = REGION_CENTERS[key];

    if (center) {
      mapRef.current.setCenter([center.lng, center.lat]);
      mapRef.current.setZoom(12); // 👈 city-level zoom
    }
  }, [region, isMapLoaded]);

  // 🚨 SOS MARKERS
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return;

    Object.keys(markersRef.current).forEach((id) => {
      if (!alerts.find((a) => a.id === id)) {
        markersRef.current[id].setMap(null);
        delete markersRef.current[id];
      }
    });

    alerts.forEach((alert) => {
      if (
        markersRef.current[alert.id] ||
        typeof alert.lat !== "number" ||
        typeof alert.lng !== "number"
      )
        return;

      const marker = new window.mappls.Marker({
        map: mapRef.current,
        position: { lng: alert.lng, lat: alert.lat },
        icon: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
      });

      marker.addListener("click", () => {
        const acceptorCount = getAcceptorCount(alert.id);
        const eventAcceptors = acceptors.filter(a => a.eventId === alert.id);
        
        // Build acceptors list HTML
        let acceptorsHTML = '';
        if (eventAcceptors.length > 0) {
          acceptorsHTML = eventAcceptors.map(acc => 
            '<div style="background: #f1f8f4; padding: 8px; margin: 6px 0; border-radius: 4px; border-left: 3px solid green;">' +
              '<div style="font-weight: bold; color: #2e7d32;">👤 ' + acc.name + '</div>' +
              '<div style="font-size: 12px; color: #555; margin-top: 2px;">📧 ' + acc.email + '</div>' +
              '<div style="font-size: 11px; color: #666; margin-top: 2px;">📍 ' + (acc.lat && acc.lng ? acc.lat.toFixed(5) + ', ' + acc.lng.toFixed(5) : 'Location unavailable') + '</div>' +
              '<div style="font-size: 11px; color: #666; margin-top: 2px;">🕐 ' + (acc.acceptedAt?.toDate ? acc.acceptedAt.toDate().toLocaleString() : 'N/A') + '</div>' +
            '</div>'
          ).join('');
        } else {
          acceptorsHTML = '<div style="color: #999; font-style: italic; text-align: center; padding: 8px;">⏳ No responders yet</div>';
        }
        
        const popupContent = 
          '<div style="padding: 12px; min-width: 280px; max-width: 380px; font-family: Arial, sans-serif; background: white; border-radius: 8px;">' +
            '<div style="background: #d32f2f; color: white; padding: 10px; margin: -12px -12px 10px -12px; border-radius: 8px 8px 0 0; font-size: 15px; font-weight: bold;">🚨 ONGOING SOS EVENT</div>' +
            '<div style="margin-bottom: 6px;"><strong>Type:</strong> <span style="background: #ffebee; color: #c62828; padding: 3px 8px; border-radius: 3px; font-weight: bold;">' + (alert.type || 'Emergency') + '</span></div>' +
            '<div style="margin-bottom: 6px;"><strong>Victim:</strong> ' + (alert.email || 'Unknown') + '</div>' +
            '<div style="margin-bottom: 6px;"><strong>Event ID:</strong> <span style="font-family: monospace; font-size: 10px;">' + alert.id + '</span></div>' +
            '<div style="margin-bottom: 6px;"><strong>Location:</strong> <span style="font-family: monospace; font-size: 11px;">' + alert.lat.toFixed(5) + ', ' + alert.lng.toFixed(5) + '</span></div>' +
            '<div style="margin-top: 10px; padding-top: 10px; border-top: 2px solid #e0e0e0;"><strong style="color: green;">✓ ' + acceptorCount + ' Responder' + (acceptorCount !== 1 ? 's' : '') + ':</strong>' + acceptorsHTML + '</div>' +
          '</div>';
        
        try {
          // Close any existing info window
          closeCurrentInfoWindow();
          
          // Try using mappls.popup method (seen in available methods)
          if (window.mappls.popup) {
            window.mappls.popup({
              map: mapRef.current,
              content: popupContent,
              latlng: [alert.lat, alert.lng]
            });
          } else {
            // Fallback to InfoWindow
            const infoWindow = new window.mappls.InfoWindow({
              content: popupContent,
              position: { lat: alert.lat, lng: alert.lng },
              maxWidth: 400
            });
            infoWindow.open(mapRef.current, marker);
            currentInfoWindowRef.current = infoWindow;
          }
        } catch (error) {
          // Silently handle errors
        }
      });

      markersRef.current[alert.id] = marker;
    });
  }, [alerts, acceptors, isMapLoaded]);

  // 👥 ACCEPTOR MARKERS
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return;

    // Remove old acceptor markers
    Object.keys(acceptorMarkersRef.current).forEach((id) => {
      if (!acceptors.find((a) => a.id === id)) {
        acceptorMarkersRef.current[id].setMap(null);
        delete acceptorMarkersRef.current[id];
      }
    });

    // Group acceptors by proximity to detect overlaps
    const groupedAcceptors = [];
    acceptors.forEach((acceptor, index) => {
      if (
        acceptorMarkersRef.current[acceptor.id] ||
        typeof acceptor.lat !== "number" ||
        typeof acceptor.lng !== "number"
      )
        return;

      // Check if this acceptor is close to any existing group
      let addedToGroup = false;
      for (let group of groupedAcceptors) {
        const distance = Math.sqrt(
          Math.pow(group[0].lat - acceptor.lat, 2) + 
          Math.pow(group[0].lng - acceptor.lng, 2)
        );
        
        // If within ~100 meters (0.001 degrees ≈ 111 meters)
        if (distance < 0.001) {
          group.push(acceptor);
          addedToGroup = true;
          break;
        }
      }
      
      if (!addedToGroup) {
        groupedAcceptors.push([acceptor]);
      }
    });

    // Add markers with slight offset for overlapping ones
    groupedAcceptors.forEach((group) => {
      group.forEach((acceptor, groupIndex) => {
        if (acceptorMarkersRef.current[acceptor.id]) return;

        // Add small offset for overlapping markers (in a circle pattern)
        const offsetAmount = 0.0002; // ~22 meters
        const angle = (groupIndex * (360 / group.length)) * (Math.PI / 180);
        const offsetLat = group.length > 1 ? Math.cos(angle) * offsetAmount : 0;
        const offsetLng = group.length > 1 ? Math.sin(angle) * offsetAmount : 0;

        const marker = new window.mappls.Marker({
          map: mapRef.current,
          position: { 
            lng: acceptor.lng + offsetLng, 
            lat: acceptor.lat + offsetLat 
          },
          icon: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
        });

        marker.addListener("click", () => {
          const acceptedTime = acceptor.acceptedAt?.toDate 
            ? acceptor.acceptedAt.toDate().toLocaleString()
            : "N/A";
          
          const relatedEvent = alerts.find(a => a.id === acceptor.eventId);
          
          let eventDetailsHTML = '';
          if (relatedEvent) {
            eventDetailsHTML = 
              '<div style="background: #ffebee; padding: 8px; margin-top: 8px; border-radius: 4px; border-left: 3px solid #d32f2f;">' +
                '<div style="margin-bottom: 4px;"><strong>Type:</strong> <span style="background: #c62828; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">' + (relatedEvent.type || 'SOS') + '</span></div>' +
                '<div style="margin-bottom: 4px;"><strong>Victim:</strong> ' + relatedEvent.email + '</div>' +
                '<div style="margin-bottom: 4px;"><strong>Event ID:</strong> <span style="font-family: monospace; font-size: 10px;">' + relatedEvent.id + '</span></div>' +
                '<div><strong>Event Location:</strong> <span style="font-family: monospace; font-size: 10px;">' + relatedEvent.lat.toFixed(5) + ', ' + relatedEvent.lng.toFixed(5) + '</span></div>' +
              '</div>';
          } else {
            eventDetailsHTML = '<div style="color: #999; font-style: italic; text-align: center; padding: 8px;">ℹ️ Event has been resolved</div>';
          }

          const groupInfo = group.length > 1 
            ? '<div style="background: #fff3cd; color: #856404; padding: 6px; margin: 8px 0; border-radius: 4px; border-left: 3px solid #ffc107; font-size: 11px;">⚠️ <strong>' + group.length + ' responders</strong> are nearby</div>'
            : '';

          const popupContent = 
            '<div style="padding: 12px; min-width: 280px; max-width: 380px; font-family: Arial, sans-serif; background: white; border-radius: 8px;">' +
              '<div style="background: #2e7d32; color: white; padding: 10px; margin: -12px -12px 10px -12px; border-radius: 8px 8px 0 0; font-size: 15px; font-weight: bold;">👤 RESPONDER / ACCEPTOR</div>' +
              '<div style="margin-bottom: 6px;"><strong>Name:</strong> <span style="color: #2e7d32; font-weight: bold;">' + acceptor.name + '</span></div>' +
              '<div style="margin-bottom: 6px;"><strong>Email:</strong> ' + acceptor.email + '</div>' +
              '<div style="margin-bottom: 6px;"><strong>Location:</strong> <span style="font-family: monospace; font-size: 11px;">' + acceptor.lat.toFixed(5) + ', ' + acceptor.lng.toFixed(5) + '</span></div>' +
              '<div style="margin-bottom: 6px;"><strong>Accepted At:</strong> <span style="font-size: 11px;">' + acceptedTime + '</span></div>' +
              groupInfo +
              '<div style="margin-top: 10px; padding-top: 10px; border-top: 2px solid #e0e0e0;"><strong style="color: #d32f2f;">🚨 Responding to:</strong>' + eventDetailsHTML + '</div>' +
            '</div>';
          
          try {
            // Close any existing info window
            closeCurrentInfoWindow();
            
            // Mappls InfoWindow with correct parameters
            const infoWindow = new window.mappls.InfoWindow({
              content: popupContent,
              position: { lat: acceptor.lat + offsetLat, lng: acceptor.lng + offsetLng },
              maxWidth: 400
            });
            infoWindow.open(mapRef.current, marker);
            
            // Store reference to close later
            currentInfoWindowRef.current = infoWindow;
          } catch (error) {
            // Silently handle errors
          }
        });

        acceptorMarkersRef.current[acceptor.id] = marker;
      });
    });
  }, [acceptors, alerts, isMapLoaded]);

  return <div id="map" style={{ width: "100%", height: "100%", position: "relative" }} />;
});

export default Map;