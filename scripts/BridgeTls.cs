using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Text;

namespace LocalMail
{
    // Credential-free probe. Keep both the TCP connection and TLS stream open for
    // the caller's Windows ownership checks on either side of the handshake.
    public sealed class BridgeProbe : IDisposable
    {
        private readonly TcpClient client;
        private SslStream tls;
        public IPEndPoint Local { get { return (IPEndPoint)client.Client.LocalEndPoint; } }
        public IPEndPoint Remote { get { return (IPEndPoint)client.Client.RemoteEndPoint; } }

        public BridgeProbe(string address, int port)
        {
            IPAddress ip = IPAddress.Parse(address);
            if (!ip.Equals(IPAddress.Loopback) && !ip.Equals(IPAddress.IPv6Loopback))
                throw new ArgumentException("Loopback required.");
            client = new TcpClient(ip.AddressFamily);
            try
            {
                IAsyncResult connecting = client.BeginConnect(ip, port, null, null);
                using (var wait = connecting.AsyncWaitHandle)
                {
                    if (!wait.WaitOne(5000)) throw new TimeoutException();
                    client.EndConnect(connecting);
                }
            }
            catch { client.Close(); throw; }
        }

        private static string ReadLine(NetworkStream stream, Stopwatch clock)
        {
            var line = new StringBuilder();
            while (line.Length < 8192)
            {
                int remaining = 5000 - (int)clock.ElapsedMilliseconds;
                if (remaining <= 0) throw new TimeoutException();
                stream.ReadTimeout = remaining;
                int b = stream.ReadByte();
                if (b < 0) throw new EndOfStreamException();
                if (b == '\n' && line.Length > 0 && line[line.Length - 1] == '\r')
                    return line.ToString(0, line.Length - 1);
                line.Append((char)b);
            }
            throw new InvalidDataException("Oversized IMAP greeting or reply.");
        }

        private static bool Ok(string line, string prefix)
        {
            return line.Equals(prefix, StringComparison.OrdinalIgnoreCase) ||
                line.StartsWith(prefix + " ", StringComparison.OrdinalIgnoreCase);
        }

        private static bool MatchesPin(X509Certificate cert, X509Chain chain,
            SslPolicyErrors errors, byte[] pin)
        {
            if (cert == null) return false;
            // The first handshake collects a public candidate after the caller
            // verifies process ownership. It never authenticates or saves a pin.
            if (pin == null) return true;
            if (chain == null || (errors & SslPolicyErrors.RemoteCertificateNotAvailable) != 0 ||
                !Convert.ToBase64String(cert.GetRawCertData()).Equals(Convert.ToBase64String(pin)))
                return false;
            using (var leaf = new X509Certificate2(cert))
            {
                DateTime now = DateTime.UtcNow;
                if (now < leaf.NotBefore.ToUniversalTime() || now > leaf.NotAfter.ToUniversalTime())
                    return false;
            }
            // The exact verified self-signed leaf is our trust anchor. Windows
            // may report it as untrusted and its name may differ from loopback.
            if ((errors & SslPolicyErrors.RemoteCertificateChainErrors) != 0)
            {
                if (chain.ChainElements.Count != 1 || chain.ChainStatus.Length == 0) return false;
                foreach (var status in chain.ChainStatus)
                    if (status.Status != X509ChainStatusFlags.UntrustedRoot) return false;
            }
            return true;
        }

        public byte[] Handshake(bool startTls, byte[] expected)
        {
            NetworkStream stream = client.GetStream();
            if (startTls)
            {
                var clock = Stopwatch.StartNew();
                if (!Ok(ReadLine(stream, clock), "* OK")) throw new InvalidDataException();
                byte[] command = Encoding.ASCII.GetBytes("A1 STARTTLS\r\n");
                stream.WriteTimeout = 5000;
                stream.Write(command, 0, command.Length);
                if (!Ok(ReadLine(stream, clock), "A1 OK")) throw new InvalidDataException();
            }
            tls = new SslStream(stream, false, (sender, cert, chain, errors) =>
                MatchesPin(cert, chain, errors, expected));
            var handshake = tls.BeginAuthenticateAsClient(Remote.Address.ToString(),
                null, SslProtocols.Tls12, false, null, null);
            using (var wait = handshake.AsyncWaitHandle)
            {
                if (!wait.WaitOne(10000)) throw new TimeoutException();
                tls.EndAuthenticateAsClient(handshake);
            }
            return tls.RemoteCertificate.GetRawCertData();
        }

        public void Dispose()
        {
            client.Close();
            if (tls != null) tls.Dispose();
        }
    }
}
