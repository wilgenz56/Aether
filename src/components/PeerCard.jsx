import { Smartphone, Monitor, Send } from 'lucide-react';

const PeerCard = ({ deviceName, deviceType, onSendClick }) => {
  const isMobile = deviceType === 'mobile';

  return (
    <div className="group w-fit bg-white/70 backdrop-blur-md border border-white/50 rounded-2xl shadow-sm transition-all hover:bg-white/90 hover:shadow-md hover:-translate-y-1 inline-flex">
      <div className="flex items-center gap-3 p-4">

        {/* 1. ICONA: Dimensione fissa */}
        <div className={`p-3 rounded-xl flex-shrink-0 transition-colors ${isMobile ? 'bg-blue-50 text-blue-500' : 'bg-purple-50 text-purple-500'}`}>
          {isMobile
            ? <Smartphone size={24} strokeWidth={2.5} />
            : <Monitor size={24} strokeWidth={2.5} />
          }
        </div>

        {/* 2. TESTO: Si adatta alla lunghezza del nome */}
        <div className="flex-shrink-0">
          <h3
            className="font-bold text-slate-900 text-base leading-snug"
            title={deviceName}
          >
            {deviceName}
          </h3>
          <p className="text-xs text-slate-500 font-semibold capitalize mt-0.5 tracking-wide opacity-70">
            {deviceType}
          </p>
        </div>

        <div></div>

        {/* 3. BOTTONE: Fisso a destra */}
        <button
          onClick={onSendClick}
          className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white p-3 sm:px-5 sm:py-2.5 rounded-xl sm:rounded-2xl font-bold transition-all shadow-md shadow-indigo-200/40 hover:shadow-lg active:scale-95 flex items-center gap-1"
        >
          <Send size={18} strokeWidth={3} />
          <span className="hidden sm:inline tracking-wider"></span>
        </button>

      </div>
    </div>
  );
};

export default PeerCard;