import { useState, useEffect, useRef } from 'react'
import './App.css'

const API_URL = 'https://odds-composer.api.nbaproptool.com'

// Collapsible JSON Viewer Component
function JsonViewer({ data, level = 0 }) {
  const [isExpanded, setIsExpanded] = useState(level < 2) // Auto-expand first 2 levels
  
  if (typeof data !== 'object' || data === null) {
    return <span className="json-value">{JSON.stringify(data)}</span>
  }
  
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="json-array">[]</span>
    
    return (
      <div 
        className="json-container clickable"
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(!isExpanded);
        }}
      >
        <span className="json-toggle">
          {isExpanded ? '▼' : '▶'} 
        </span>
        <span className="json-bracket">[</span>
        {isExpanded ? (
          <div className="json-content">
            {data.map((item, index) => (
              <div key={index} className="json-item" style={{ marginLeft: '20px' }}>
                <JsonViewer data={item} level={level + 1} />
                {index < data.length - 1 && <span className="json-comma">,</span>}
              </div>
            ))}
          </div>
        ) : (
          <span className="json-summary">...{data.length} items</span>
        )}
        <span className="json-bracket">]</span>
      </div>
    )
  }
  
  const keys = Object.keys(data)
  if (keys.length === 0) return <span className="json-object">{'{}'}</span>
  
  return (
    <div 
      className="json-container clickable"
      onClick={(e) => {
        e.stopPropagation();
        setIsExpanded(!isExpanded);
      }}
    >
      <span className="json-toggle">
        {isExpanded ? '▼' : '▶'} 
      </span>
      <span className="json-bracket">{'{'}</span>
      {isExpanded ? (
        <div className="json-content">
          {keys.map((key, index) => (
            <div key={key} className="json-item" style={{ marginLeft: '20px' }}>
              <span className="json-key">"{key}": </span>
              <JsonViewer data={data[key]} level={level + 1} />
              {index < keys.length - 1 && <span className="json-comma">,</span>}
            </div>
          ))}
        </div>
      ) : (
        <span className="json-summary">...{keys.length} properties</span>
      )}
      <span className="json-bracket">{'}'}</span>
    </div>
  )
}

function App() {
  // State
  const [sseConnected, setSseConnected] = useState(false)
  const [pushedMessages, setPushedMessages] = useState([])
  const [connectionCount, setConnectionCount] = useState(0)
  const eventSourceRef = useRef(null)

  // Function to fetch connection count
  const fetchConnectionCount = async () => {
    try {
      const response = await fetch(`${API_URL}/api/status`)
      const data = await response.json()
      setConnectionCount((data.websocketConnections || 0) + (data.sseConnections || 0))
    } catch (error) {
      console.error('Error fetching connection count:', error)
    }
  }

  // Function to safely render message content
  const renderMessageContent = (msg) => {
    // If the message has a data property, show that
    if (msg.data) {
      return typeof msg.data === 'string' ? msg.data : <JsonViewer data={msg.data} />
    }
    // If the message has a message property, show that
    if (msg.message) {
      return typeof msg.message === 'string' ? msg.message : <JsonViewer data={msg.message} />
    }
    // Fallback to stringifying the entire message
    return <JsonViewer data={msg} />
  }

  // Function to get connection status
  const getConnectionStatus = () => {
    if (!eventSourceRef.current) return 'No connection'
    return eventSourceRef.current.readyState === EventSource.OPEN ? 'Open' : 'Connecting'
  }

  // Log current connection status
  useEffect(() => {
    const logStatus = () => {
      console.log('Current SSE status:', getConnectionStatus())
      console.log('EventSource ref:', eventSourceRef.current)
    }
    
    // Log status every 10 seconds for debugging
    const statusInterval = setInterval(logStatus, 10000)
    
    return () => clearInterval(statusInterval)
  }, [])

  // SSE connection
  useEffect(() => {
    const connectSSE = () => {
      console.log('Creating new SSE connection...')
      const eventSource = new EventSource(`${API_URL}/api/events`)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        console.log('SSE connected')
        setSseConnected(true)
        // Fetch connection count when connected
        fetchConnectionCount()
      }

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log('Received SSE message:', data)
          
          // Display all messages except connection and broadcast messages
          // Since backend forwards exact message, only filter out system messages
          if (!data.type || (data.type !== 'connection' && data.type !== 'broadcast')) {
            const messageId = Date.now() + Math.random()
            const newMessage = { ...data, isNew: true, messageId }
            
            // Remove isNew flag from all previous messages and add the new one
            setPushedMessages(prev => [
              ...prev.map(msg => ({ ...msg, isNew: false })),
              newMessage
            ])
            
            // Remove the isNew flag after 10 seconds
            setTimeout(() => {
              setPushedMessages(prev => 
                prev.map(msg => 
                  msg.messageId === messageId ? { ...msg, isNew: false } : msg
                )
              )
            }, 10000)
          }
          // Update connection count when receiving messages
          fetchConnectionCount()
        } catch (error) {
          console.error('Error parsing SSE message:', error)
        }
      }

      eventSource.onerror = (error) => {
        console.error('SSE error:', error)
        setSseConnected(false)
        // Try to reconnect after 3 seconds
        setTimeout(connectSSE, 3000)
      }

      // Handle connection close
      eventSource.onclose = () => {
        console.log('SSE connection closed')
        setSseConnected(false)
        // Try to reconnect after 3 seconds
        setTimeout(connectSSE, 3000)
      }
    }

    connectSSE()

    // Set up interval to refresh connection count
    const interval = setInterval(fetchConnectionCount, 5000)

    return () => {
      console.log('Cleaning up SSE connection...')
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Messages from Backend</h1>
        <div className="ws-status">
          SSE: {sseConnected ? '🟢 Connected' : '🔴 Disconnected'} 
          <span className="connection-count">({connectionCount} connections)</span>
        </div>
      </header>

      <main className="app-main">
        <div className="api-section">
          <h2>
            Messages Pushed from Backend
            <button 
              onClick={() => setPushedMessages([])}
              className="api-button clear-button"
            >
              Clear Messages
            </button>
          </h2>
          <div className="ws-messages">
            {pushedMessages.length === 0 ? (
              <p className="no-messages">No messages pushed from backend yet. Messages will appear here in real-time when pushed from the backend.</p>
            ) : (
              [...pushedMessages]
                .reverse()
                .map((msg, index) => (
                  <div 
                    key={`${msg.messageId || index}-${msg.isNew ? 'new' : 'old'}`}
                    className={`ws-message ${msg.type || msg.event} ${index === 0 ? 'latest' : ''} ${msg.isNew ? 'new-message' : ''}`}
                  >
                    <div hidden>{JSON.stringify(msg)}</div>
                    <div className="message-header">
                      <span className="message-type">
                        {msg.event || msg.type || 'message'}
                      </span>
                      <span className="message-time">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="message-content">
                      {renderMessageContent(msg)}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
