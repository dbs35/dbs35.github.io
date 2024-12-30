const { useState, useEffect } = React;
const { Dog } = lucide;

const Card = ({ children, className }) => (
  <div className={`bg-white shadow-lg rounded-lg ${className}`}>{children}</div>
);

const CardHeader = ({ children }) => (
  <div className="px-6 py-4 border-b border-gray-200">{children}</div>
);

const CardContent = ({ children }) => (
  <div className="px-6 py-4">{children}</div>
);

const Button = ({ children, onClick, disabled, className }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
  >
    {children}
  </button>
);

const DogFeedingTracker = () => {
  const [hasBeenFed, setHasBeenFed] = useState(false);
  const [lastFedTime, setLastFedTime] = useState(null);

  useEffect(() => {
    const now = new Date();
    const storedDate = localStorage.getItem('lastFedDate');
    const storedTime = localStorage.getItem('lastFedTime');
    
    if (storedDate) {
      const lastDate = new Date(storedDate);
      if (lastDate.getDate() !== now.getDate() || 
          lastDate.getMonth() !== now.getMonth() || 
          lastDate.getFullYear() !== now.getFullYear()) {
        setHasBeenFed(false);
        setLastFedTime(null);
        localStorage.removeItem('lastFedDate');
        localStorage.removeItem('lastFedTime');
      } else {
        setHasBeenFed(true);
        setLastFedTime(storedTime);
      }
    }
  }, []);

  const handleFeedingClick = () => {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    
    setHasBeenFed(true);
    setLastFedTime(timeString);
    localStorage.setItem('lastFedDate', now.toISOString());
    localStorage.setItem('lastFedTime', timeString);
  };

  return React.createElement(Card, { className: "w-full max-w-md mx-auto mt-8" },
    React.createElement(CardHeader, null,
      React.createElement("div", { className: "text-2xl font-bold flex items-center justify-center gap-2" },
        React.createElement(Dog, { className: "h-8 w-8" }),
        "Dog Feeding Tracker"
      )
    ),
    React.createElement(CardContent, null,
      React.createElement("div", { className: "space-y-6 text-center" },
        React.createElement("div", { className: "text-xl font-medium" },
          hasBeenFed ? 
            React.createElement("div", { className: "text-green-600" },
              "The dog has been fed!",
              React.createElement("div", { className: "text-sm text-gray-500 mt-2" },
                "Last fed at: ", lastFedTime
              )
            ) :
            React.createElement("div", { className: "text-yellow-600" },
              "The dog needs to be fed"
            )
        ),
        React.createElement(Button, {
          onClick: handleFeedingClick,
          disabled: hasBeenFed,
          className: "w-full"
        }, "I fed the dog"),
        React.createElement("div", { className: "text-sm text-gray-500" },
          "Status resets automatically each day at midnight"
        )
      )
    )
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(DogFeedingTracker));