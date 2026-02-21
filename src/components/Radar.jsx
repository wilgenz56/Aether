import { Wifi } from 'lucide-react';

const Radar = () => {
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-6 text-center">
      {/* Cerchio esterno che pulsa */}
      <div className="relative flex items-center justify-center p-10 rounded-full bg-blue-50">
        <div className="absolute w-full h-full rounded-full bg-blue-400 opacity-20 animate-ping"></div>
        {/* Icona centrale */}
        <Wifi size={64} className="text-blue-600 relative z-10" />
      </div>
      <div>
        <h2 className="text-2xl font-semibold text-gray-800">In cerca di dispositivi...</h2>
      </div>
    </div>
  );
};

export default Radar;