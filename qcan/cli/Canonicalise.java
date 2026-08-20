import cl.uchile.dcc.qcan.main.SingleQuery;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

public class Canonicalise {

    public static void main(String[] args) throws Exception {
        if (args.length == 0) {
            serve();
            return;
        }

        try {
            System.out.println(canonicalise(args));
        } catch (IllegalArgumentException e) {
            System.err.println(e.getMessage());
            System.exit(2);
        } catch (Exception e) {
            System.err.println(e.getClass().getSimpleName() + ": " + e.getMessage());
            System.exit(1);
        }
    }

    // One request per line on stdin, its fields the base64-encoded arguments,
    // and one "OK <base64 query>" or "ERR <base64 message>" per line on stdout.
    private static void serve() throws Exception {
        BufferedReader input = new BufferedReader(
                new InputStreamReader(System.in, StandardCharsets.UTF_8));
        Base64.Decoder decoder = Base64.getDecoder();
        Base64.Encoder encoder = Base64.getEncoder();
        String line;

        while ((line = input.readLine()) != null) {
            if (line.isEmpty()) {
                continue;
            }

            String[] fields = line.split(" ");
            String[] arguments = new String[fields.length];

            for (int i = 0; i < fields.length; i++) {
                arguments[i] = new String(decoder.decode(fields[i]), StandardCharsets.UTF_8);
            }

            String response;

            try {
                response = "OK " + encode(encoder, canonicalise(arguments));
            } catch (Exception e) {
                response = "ERR " + encode(encoder,
                        e.getClass().getSimpleName() + ": " + e.getMessage());
            }

            System.out.println(response);
            System.out.flush();
        }
    }

    private static String encode(Base64.Encoder encoder, String payload) {
        return encoder.encodeToString(payload.getBytes(StandardCharsets.UTF_8));
    }

    private static String canonicalise(String[] args) throws Exception {
        String query = null;
        boolean minimise = false;

        for (int i = 0; i < args.length; i++) {
            if (args[i].equals("-q") && i + 1 < args.length) {
                query = args[++i];
            } else if (args[i].equals("-m")) {
                minimise = true;
            } else {
                throw new IllegalArgumentException("unknown argument: " + args[i]);
            }
        }

        if (query == null) {
            throw new IllegalArgumentException("usage: -q <query> [-m]");
        }

        SingleQuery sq = new SingleQuery(query, true, true, minimise, true, false);
        return sq.getQuery();
    }
}
